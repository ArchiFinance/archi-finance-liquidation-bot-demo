import { BigNumber } from "ethers";

const wait = () => {
    setTimeout(() => console.log(`waiting...`), Math.floor(Math.random() * 10) * 1000);
};

const sleep = async (t: number) => {
    return new Promise((resolve) => {
        setTimeout(() => {
            resolve(true);
        }, t);
    });
}

const formatBigNumber = (v: BigNumber | Array<BigNumber>): any => {
    if (v instanceof BigNumber) {
        return v.toString();
    }

    if (v instanceof Array) {
        return v.map((vv, i) => { return vv.toString() });
    }
}

export {
    wait,
    sleep,
    formatBigNumber
}