import { Database, DatabaseConfig } from "aloedb-node";
import * as dotenv from "dotenv";

dotenv.config();

const db = {
    system: new Database<any>({
        path: "./database/system.json",
        pretty: true,
        autoload: true,
        autosave: false,
        immutable: false,
        batching: true,
        validator: (document: any) => { }
    }),
    user: new Database<any>({
        path: "./database/events.json",
        pretty: true,
        autoload: true,
        autosave: true,
        immutable: false,
        batching: true,
        validator: (document: any) => { }
    }),
}
const PrettyError = require('pretty-error');

const onError = (err: any) => {
    console.log(new PrettyError().render(err));
}

const contracts = [
    {
        name: "CreditCaller",
        logic: process.env.CREDIT_CALLER as string,
        abi: require("./abis/CreditCaller.json").abi,
        events: ["LendCredit", "RepayCredit"],
        onError: onError,
        fetch: {
            // fromBlock: 59039680,
            fromBlock: 0,
        }
    }
];

export default {
    contracts,
    db,
}