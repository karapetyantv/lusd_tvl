
exports.URL = `wss://eth-mainnet.g.alchemy.com/v2/${process.env.API_KEY}`;
exports.WEB3_OPTIONS = {
    reconnect: {
        auto: true,
        delay: 5000, // ms
        maxAttempts: 5,
        onTimeout: false
    }
};

// Dates source: https://dune.com/queries/32594/65606
exports.FROM_DATE = "2021-05-12T00:00:00Z"
exports.TO_DATE = "2021-05-25T00:00:00Z"

exports.BORROW_OPS = "0x24179CD81c9e782A4096035f7eC97fB8B783e007";
exports.LUSD_ADDR = "0x5f98805A4E8be255a32880FDeC7F6728C6568bA0";
exports.EVENT = "TroveUpdated";

exports.INITIAL_BLOCK_RANGE = 1000;
exports.SUCCESSFULL_CHUNKS_THRESHOLD = 100;

exports.CLOSE_OP = 1;
exports.TRANSFER_TOPIC = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
exports.ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";