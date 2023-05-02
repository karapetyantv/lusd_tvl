const fs = require("fs");

const EthDater = require('ethereum-block-by-date');
const Web3 = require("web3");

const constants = require("./constants.js");

const provider = new Web3.providers.WebsocketProvider(constants.URL, constants.WEB3_OPTIONS);
const web3 = new Web3(provider);

function getContractInstance(address, abiPath) {
    const abi = JSON.parse(fs.readFileSync(abiPath));
    return new web3.eth.Contract(abi, address);
}

async function getEventsInChunks(contract, eventName, fromBlock, toBlock) {
    if (fromBlock > toBlock) {
        console.log('fromBlock is higher than toBlock')
        return [];
    }
    let chunkSize = constants.INITIAL_BLOCK_RANGE;
    let allEvents = [];
    let successfulChunks = 0;

    console.log(`Start processing blocks ${fromBlock}, ${toBlock} with chunk size = ${chunkSize}`);
    for (let chunkStartBlock = fromBlock; chunkStartBlock <= toBlock; chunkStartBlock += (chunkSize + 1)) {
        let chunkEndBlock;

        if (chunkStartBlock > toBlock) {
            let lastStoredBlock = allEvents[allEvents.length - 1].blockNumber;
            if (lastStoredBlock >= toBlock) {
                // Reached an end of initial interval
                break;
            } else {
                chunkStartBlock = lastStoredBlock + 1;
                chunkEndBlock = toBlock;
            }
            console.log(`chunkStartBlock is higher than toBlock, reducing it to ${lastStoredBlock + 1}`);
        } else {
            chunkEndBlock = chunkStartBlock + chunkSize;
            chunkEndBlock = chunkEndBlock > toBlock ? toBlock : chunkEndBlock;
        }

        try {
            console.log(`Getting events chunk for blocks [${chunkStartBlock}, ${chunkEndBlock}]`)
            const eventsChunk = await contract.getPastEvents(eventName, {
                fromBlock: chunkStartBlock,
                toBlock: chunkEndBlock,
                filter: { to: constants.ZERO_ADDRESS }
            });

            console.log(`Successuly got events for blocks [${chunkStartBlock}, ${chunkEndBlock}]`);

            allEvents = allEvents.concat(eventsChunk);
            successfulChunks += 1;

            if (successfulChunks >= constants.SUCCESSFULL_CHUNKS_THRESHOLD) {
                // Use large chunks again after multiple successfull
                // attempts with small chunk size
                console.log(`Increasing chunk size to ${chunkSize * 2} after ${constants.SUCCESSFULL_CHUNKS_THRESHOLD} successfull chunks`);
                chunkSize = chunkSize * 2;
                successfulChunks = 0;
            }
        } catch (err) {
            if (err.message != 'Returned error: query timeout of 10 seconds exceeded') {
                // The only way to identify error from node is by err.message
                throw err;
            }
            // Cut chunk size in half if current size is too big to process
            console.log(`Failed to get events with chunk size ${chunkSize}, reducing chunk size to ${Math.ceil(chunkSize / 2)}`)
            successfulChunks = 0;
            chunkSize = Math.ceil(chunkSize / 2);
        }
    }

    console.log(`Finished processing chunks. Got total of ${allEvents.length} events`);
    return allEvents;
}

(async () => {
    const borrowOps = getContractInstance(
        constants.BORROW_OPS,
        "./assets/BorrowerOperations.json"
    );

    const lusd = getContractInstance(constants.LUSD_ADDR, "./assets/LUSD.json");

    const dater = new EthDater(
        web3 // Web3 object, required.
    );

    const fromBlock = (await dater.getDate(constants.FROM_DATE)).block;
    const toBlock = (await dater.getDate(constants.TO_DATE)).block;

    const PRECISION = 10 ** (await lusd.methods.decimals().call());
    const MILL = 10 ** 6;
    lusdSupplyBefore = (await lusd.methods.totalSupply().call({}, fromBlock)) / PRECISION / MILL;
    lusdSupplyAfter = (await lusd.methods.totalSupply().call({}, toBlock)) / PRECISION / MILL;

    const events = await getEventsInChunks(lusd, 'Transfer', fromBlock, toBlock);
    let totalValue = 0;
    events.forEach(_event => {
        const sender = _event.returnValues.from;
        const value = _event.returnValues.value / PRECISION;
        totalValue += value;
        console.log(`From = ${sender}, Value: ${value}, block: ${_event.blockNumber}, tx: ${_event.transactionHash}`);
});

    console.log(`LUSD total supply. Before = ${lusdSupplyBefore} millions, after = ${lusdSupplyAfter} millions, diff = ${lusdSupplyBefore - lusdSupplyAfter} millions`)
    console.log(`Total burned value = ${totalValue / MILL} millions LUSD`);
    web3.currentProvider.disconnect();
})()
    .then()
    .catch(err => {
        console.log(err);
        process.exit(1);
    });
