import config from "./config";
import { ethers } from "ethers";
import { WebSocketProvider } from "./providers/websocket";

const CHUNCK_SIZE = 500;

async function main() {
    // const provider = new ethers.providers.WebSocketProvider(process.env.URL as string);
    const provider = new WebSocketProvider(process.env.URL as string);
    const wallet = new ethers.Wallet(process.env.PRIVATE_KEY as string, provider);

    const user = await config.db.user;
    const system = await config.db.system;

    let batchUpdateBlock = 0;

    provider.on("block", async block => {
        const currentBlock = await system.findOne({ block: "CURRENT_BLOCK" });

        if (currentBlock == null) {
            await system.insertOne({ block: "CURRENT_BLOCK", blockNumber: block });
        } else {
            await system.updateOne({ block: "CURRENT_BLOCK" }, { blockNumber: block });
        }

        if (block - batchUpdateBlock > CHUNCK_SIZE) {
            batchUpdateBlock = block;
            await system.save();
        }
    });

    const contracts = [];

    for (let contract of config.contracts) {
        contracts.push({
            name: contract.name,
            instance: new ethers.Contract(contract.logic, contract.abi, provider),
            handler: import(`./events/${contract.name}`),
            events: contract.events,
            onError: contract.onError,
            fetch: contract.fetch
        });
    }

    let latestBlock = await provider.getBlockNumber();

    for (let contract of contracts) {
        contract.handler.then(async (res) => {
            console.log(`${contract.name} [${contract.events.toString()}] listening....`);

            for (let eventName of contract.events) {
                let fromBlock = contract.fetch.fromBlock;
                const snapshot = await system.findOne({ name: contract.name, eventName: eventName });

                if (snapshot != null) {
                    fromBlock = snapshot.fetchBlock;
                } else {
                    await system.insertOne({ name: contract.name, eventName: eventName, fetchBlock: fromBlock });
                }

                // Always check -CHUNCK_SIZE more blocks
                fromBlock = fromBlock - CHUNCK_SIZE;

                const filter = contract.instance.filters[eventName]();
                const blocksToCheck = latestBlock - fromBlock;
                const numChunks = Math.ceil(blocksToCheck / CHUNCK_SIZE);

                for (let chunk = 0; chunk < numChunks; chunk++) {
                    const chunkFrom = fromBlock + (chunk * CHUNCK_SIZE);
                    const chunkTo = Math.min((chunkFrom + CHUNCK_SIZE), latestBlock);

                    console.log(`Pulling ${eventName}/${contract.name} [${chunk}/${numChunks}]`);

                    const events = await contract.instance.queryFilter(filter, chunkFrom, chunkTo);

                    for (const event of events) {
                        await res.default(user, contract.name, wallet, event);
                    }
                }

                await system.updateOne({ name: contract.name, eventName: eventName }, { fetchBlock: latestBlock });
            }

            console.log(`Query missing blocks completed`);

            return contract.instance.on("*", (event: any) => {
                if (contract.events.length == 0) {
                    res.default(user, contract.name, wallet, event);

                    return;
                }

                if (contract.events.indexOf(event.event) > -1) {
                    res.default(user, contract.name, wallet, event);
                }
            });
        }).catch(err => {
            contract.onError(err);
        });
    }
}

main()
    .catch((error) => {
        console.error(`error: ${error}`);
        process.exit(1);
    });