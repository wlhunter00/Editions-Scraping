// This scfiret demonstrates access to the NFT API via the Alchemy SDK.
import { Network, Alchemy } from "alchemy-sdk";
import * as dotenv from 'dotenv';
dotenv.config();
import * as fs from 'fs';

// Optional Config object, but defaults to demo api-key and eth-mainnet.
const settings = {
    apiKey: process.env.ALCHEMY, // Replace with your Alchemy API Key.
    network: Network.ETH_MAINNET, // Replace with your network.
};

const alchemy = new Alchemy(settings);

// Print owner's wallet address:
const contractAddress = "0x580a29FA60B86AaFF102743dE5Cba60Bb5f9de75";

let consume = []

let pageIndex = "";
let testCount = 0;

function returnLastElement(arr, j, n) {
    arr.sort(function (a, b) { return a - b });

    for (let i = j; i < n; i++)
        if (arr[i] - arr[i - 1] != 1)
            return i - 1;

    return n - 1;
}

function detectRange(artName) {
    let idArray = aggregator[artName];
    let megaString = "";
    let endPoint = -1;
    idArray.sort(function (a, b) { return a - b });

    while (endPoint != idArray.length - 1) {
        const newBegin = endPoint + 2;
        // console.log(newBegin);
        endPoint = returnLastElement(idArray, newBegin, idArray.length);
        if (idArray[endPoint] === idArray[newBegin - 1]) {
            megaString = `${megaString}, ${idArray[endPoint]}`;
        }
        else {
            megaString = `${megaString}, ${idArray[newBegin - 1]}-${idArray[endPoint]}`;
        }
    }
    megaString = megaString.slice(2);
    return megaString
    // console.log(megaString)
}

function appendToList(contractCall) {
    contractCall.nfts.forEach(nft => {
        testCount++;
        if (nft.title.includes("Consume")) {
            consume.push(nft.tokenId);
        }
    })
    pageIndex = contractCall.pageKey;
    // console.log("setting key", contractCall);
}

console.log("fetching NFTs for contract address:", contractAddress);
console.log("...");

// Print total NFT count returned in the response:
const nftsForContract = await alchemy.nft.getNftsForContract(contractAddress);

// console.log(nftsForContract);
appendToList(nftsForContract);
while (pageIndex != undefined) {
    console.log("making api call", pageIndex);
    const newContractCall = await alchemy.nft.getNftsForContract(contractAddress, {
        pageKey: pageIndex
    });
    appendToList(newContractCall);
}


const aggregator = { consume }
const artList = Object.keys(aggregator);
let final = {}

artList.forEach(artname => {
    const newIDs = detectRange(artname);
    final[artname] = newIDs;
});

console.log(final);
console.log(testCount);

// Write data in 'Output.txt' .
fs.writeFile('./outputs/consume.txt', JSON.stringify(final), (err) => {
    // In case of a error throw err.
    if (err) throw err;
})