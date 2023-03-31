// This script demonstrates access to the NFT API via the Alchemy SDK.
import { Network, Alchemy } from "alchemy-sdk";
import * as dotenv from 'dotenv';
dotenv.config();
import { Client } from "@notionhq/client"

const notion = new Client({ auth: process.env.NOTION_SECRET })
const databaseId = process.env.DATABASE_ID

// Optional Config object, but defaults to demo api-key and eth-mainnet.
const settings = {
    apiKey: process.env.ALCHEMY, // Replace with your Alchemy API Key.
    network: Network.ETH_MAINNET, // Replace with your network.
};

const alchemy = new Alchemy(settings);

// Print owner's wallet address:
const contractAddress = "0x22C1f6050E56d2876009903609a2cC3fEf83B415";


let contributor = []
let adopter = []

let pageIndex = "";
let testCount = 0;

function appendToList(contractCall) {
    contractCall.nfts.forEach(nft => {
        testCount++;

        if (nft.rawMetadata.attributes) {
            nft.rawMetadata.attributes.forEach(attribute => {
                if (attribute.trait_type.includes("eventURL") && attribute.value.includes("fractional.art")) {
                    console.log(nft.title)
                    if (nft.title.includes("Contributors")) {
                        contributor.push(nft.tokenId);
                    }
                    else if (nft.title.includes("Adopter")) {
                        adopter.push(nft.tokenId);
                    }
                }
            })
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

console.log("contributor ids", contributor);
console.log("adopter ids", adopter);

console.log("contributor count", contributor.length);
console.log("adopter count", adopter.length);
console.log(pageIndex);
console.log(testCount);

import * as fs from 'fs';
const final = { contributor, adopter }

// Write data in 'Output.txt' .
fs.writeFile('./outputs/fractional-poap.txt', JSON.stringify(final), (err) => {
    // In case of a error throw err.
    if (err) throw err;
})