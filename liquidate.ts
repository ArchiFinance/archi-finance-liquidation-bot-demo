import * as dotenv from "dotenv";
import { BigNumber, ethers } from "ethers";
import { Database } from "aloedb-node";
import { Listr } from "listr2";

const db = new Database<any>('./database/events.json');

dotenv.config();

const NAME = `CreditCaller`;
const LEND_CREDIT = `LendCredit`;
const LIQUIDATE_THRESHOLD = 100;
const MAX_LOAN_DURATION = 60 * 60 * 24 * 365;

const contracts = {
    CreditCaller: {
        logic: process.env.CREDIT_CALLER as string,
        abi: require("./abis/CreditCaller.json").abi
    },
    CreditUser: {
        logic: process.env.CREDIT_USER as string,
        abi: require("./abis/CreditUser.json").abi
    }
};

async function main() {
    const provider = new ethers.providers.WebSocketProvider(process.env.URL as string);
    const wallet = new ethers.Wallet(process.env.PRIVATE_KEY as string);
    const signer = wallet.connect(provider);

    const events = await db.findMany({ name: NAME, event: LEND_CREDIT, terminated: false });
    const creditCaller = new ethers.Contract(contracts.CreditCaller.logic, contracts.CreditCaller.abi, signer);
    const creditUser = new ethers.Contract(contracts.CreditUser.logic, contracts.CreditUser.abi, signer);
    const tasks = new Listr([], { concurrent: false });

    for (let event of events) {
        tasks.add({
            title: `Scanning borrowedIndex ${event.borrowedIndex}`,
            task: async (ctx, task): Promise<void> => {
                task.output = `[0] Call isTerminated`;
                const terminated = await creditUser.callStatic.isTerminated(event.recipient, event.borrowedIndex);

                if (terminated) {
                    await db.updateOne({ name: NAME, event: LEND_CREDIT, recipient: event.recipient, borrowedIndex: event.borrowedIndex }, { terminated: true });
                    return task.skip("Terminated");
                }

                task.output = `[1] Call getUserCreditHealth`;
                const health = await creditCaller.callStatic.getUserCreditHealth(event.recipient, event.borrowedIndex);
                task.output = `[2] Call isTimeout`;
                const timeout = await creditUser.callStatic.isTimeout(event.recipient, event.borrowedIndex, MAX_LOAN_DURATION);
                let estimateGas: BigNumber = BigNumber.from("0");

                try {
                    estimateGas = await creditCaller.estimateGas.liquidate(event.recipient, event.borrowedIndex);
                } catch (error: any) {
                    return task.skip(error.reason);
                }

                if (health <= LIQUIDATE_THRESHOLD || timeout) {
                    ctx.input = await task.prompt<boolean>({ type: 'Toggle', message: `Are you sure to execute? [gas: ${ethers.utils.formatEther(estimateGas)}]` })

                    if (ctx.input === true) {
                        const tx = await creditCaller.liquidate(event.recipient, event.borrowedIndex);
                        await provider.getTransactionReceipt(tx.txHash);
                    } else {
                        return task.skip();
                    }
                }
            },
            exitOnError: false,
        });
    }

    try {
        await tasks.run();
    } catch (e) {
        console.error(e);
    }

    process.exit(1);
}

main()
    .catch((error) => {
        console.error(`error: ${error}`);
        process.exit(1);
    });