import { Database } from "aloedb-node";
import { formatBigNumber } from "../utils";

const LEND_CREDIT = `LendCredit`;
const REPAY_CREDIT = `RepayCredit`;

export default async (db: Database, name: string, wallet: any, event: any) => {
    if (event.event == LEND_CREDIT) {
        const found = await db.findOne({ name: name, transactionHash: event.transactionHash, event: event.event });

        if (!found) {
            db.insertOne({
                name: name,
                transactionHash: event.transactionHash,
                blockNumber: event.blockNumber,
                event: event.event,
                recipient: event.args["_recipient"],
                borrowedIndex: formatBigNumber(event.args["_borrowedIndex"]),
                depositor: event.args["_depositor"],
                token: event.args["_token"],
                amountIn: formatBigNumber(event.args["_amountIn"]),
                borrowedTokens: event.args["_borrowedTokens"],
                ratios: formatBigNumber(event.args["_ratios"]),
                timestamp: formatBigNumber(event.args["_timestamp"]),
                terminated: false
            });
        }
    }

    if (event.event == REPAY_CREDIT) {
        const repayEvent = {
            recipient: event.args["_recipient"],
            borrowedIndex: formatBigNumber(event.args["_borrowedIndex"]),
            collateralToken: event.args["_collateralToken"],
            collateralAmountOut: formatBigNumber(event.args["_collateralAmountOut"]),
            amountIn: formatBigNumber(event.args["_amountIn"]),
            timestamp: formatBigNumber(event.args["_timestamp"]),
        }

        await db.updateOne(
            { name: name, event: LEND_CREDIT, recipient: repayEvent.recipient, borrowedIndex: repayEvent.borrowedIndex },
            { terminated: true, repayTimestamp: repayEvent.timestamp }
        );
    }
};