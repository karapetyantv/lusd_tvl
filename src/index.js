const fs = require("fs");

const EthDater = require('ethereum-block-by-date');
const Web3 = require("web3");

const constants = require("./constants.js");

let web3;

function setupWeb3(url, options) {
    const provider = new Web3.providers.WebsocketProvider(url, options);
    web3 = new Web3(provider);
}

function getContractInstance(address, abiPath) {
    const abi = JSON.parse(fs.readFileSync(abiPath));
    return new web3.eth.Contract(abi, address);
}

async function getEventsInChunks(contract, eventName, fromBlock, toBlock) {
    console.log(`Start processing blocks ${fromBlock}, ${toBlock}`);
    if (fromBlock > toBlock) {
        console.log('fromBlock is higher than toBlock')
        return [];
    }
    let chunkSize = constants.INITIAL_BLOCK_RANGE;
    let allEvents = [];
    let successfulChunks = 0;
    for (let chunkStartBlock = fromBlock; chunkStartBlock <= toBlock; chunkStartBlock += (chunkSize + 1)) {
        if (chunkStartBlock > toBlock) {
            let lastStoredBlock = allEvents[allEvents.length - 1].blockNumber + 1;
            chunkStartBlock = lastStoredBlock < toBlock ? lastStoredBlock : toBlock;
            console.log(`chunkStartBlock is higher than toBlock, reducing it to ${lastStoredBlock}`);
        }
        let chunkEndBlock = chunkStartBlock + chunkSize;
        if (chunkEndBlock > toBlock) {
            chunkEndBlock = toBlock;
            console.log(`chunkStartBlock is higher than toBlock, reducing it to ${toBlock}`);
        }
        try {
            console.log(`Getting events chunk for blocks [${chunkStartBlock}, ${chunkEndBlock}]`)
            const eventsChunk = await contract.getPastEvents(eventName, {
                fromBlock: chunkStartBlock,
                toBlock: chunkEndBlock
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
    setupWeb3(constants.URL, constants.WEB3_OPTIONS);

    const borrowOps = getContractInstance(
        constants.BORROW_OPS,
        './assets/BorrowerOperations.json'
    );

    const dater = new EthDater(
        web3 // Web3 object, required.
    );

    const fromBlock = await dater.getDate(constants.FROM_DATE);
    const toBlock = await dater.getDate(constants.TO_DATE);

    const events = await getEventsInChunks(borrowOps, constants.EVENT, fromBlock.block, toBlock.block)
    const closeEvents = events.filter(_event => _event.returnValues.operation == constants.CLOSE_OP);
    const closeHashes = closeEvents.map(_event => _event.transactionHash)
    const closeTxsPromises = closeHashes.map(_hash => web3.eth.getTransactionReceipt(_hash));

    for (let i = 0; i < closeTxsPromises.length; i += 10) {
        const chunk = closeTxsPromises.slice(i, i + 10);
        let closeTxs = await Promise.all(chunk);

        closeTxs.forEach(_tx => {
            _tx.logs.forEach(_log => {
                if (_log.topics[0] == constants.TRANSFER_TOPIC) {
                    const value = Math.floor(parseInt(_log.data, 16) / 10 ** 18);
                    if (value == 200) {
                        return;
                    }
                    console.log(`From = ${_tx.from}, Value: ${value}, block: ${_tx.blockNumber}, tx: ${_tx.transactionHash}`);
                }
            })
        });
    }
    web3.currentProvider.disconnect();
})()
    .then()
    .catch(err => {
        console.log(err);
        process.exit(1);
    });
