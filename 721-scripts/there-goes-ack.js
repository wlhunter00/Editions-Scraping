// This scfiret demonstrates access to the NFT API via the Alchemy SDK.
import { Network, Alchemy } from "alchemy-sdk";
import * as dotenv from 'dotenv';
dotenv.config();
import { Client } from "@notionhq/client"
import * as fs from 'fs';

const notion = new Client({ auth: process.env.NOTION_SECRET })
const databaseId = process.env.DATABASE_ID

// Optional Config object, but defaults to demo api-key and eth-mainnet.
const settings = {
    apiKey: process.env.ALCHEMY, // Replace with your Alchemy API Key.
    network: Network.ETH_MAINNET, // Replace with your network.
};

const alchemy = new Alchemy(settings);

// Print owner's wallet address:
const contractAddress = "0x503a3039e9ce236e9a12E4008AECBB1FD8B384A3";
const artistNotionID = "61723c60e9274ce1b942657596dd024b";

// Function to add into notion db
async function addItem(title, tokenType, collection, artistID, address, tokenIDs) {
    try {
        const response = await notion.pages.create({
            parent: { database_id: databaseId },
            properties: {
                title: {
                    title: [
                        {
                            "text": {
                                "content": title
                            }
                        }
                    ]
                },
                'Contract Type': {
                    'select': {
                        'name': tokenType
                    }
                },
                'Collection': {
                    'select': {
                        'name': collection
                    }
                },
                Artist: {
                    relation: [{
                        id: artistID
                    }]
                },
                Contract: {
                    "rich_text": [
                        {
                            "type": "text",
                            "text": {
                                "content": address
                            }
                        },
                    ]
                },
                'Collection Category': {
                    'select': {
                        'name': "Edition"
                    }
                },
                'Token ID(s)': {
                    "rich_text": [
                        {
                            "type": "text",
                            "text": {
                                "content": tokenIDs
                            }
                        },
                    ]
                },
            },
        })
        console.log(response)
        console.log("Success! Entry added.")
    } catch (error) {
        console.error(error.body)
    }
}

// const response = await notion.pages.retrieve({ page_id: "ef408f17-ee65-4008-91db-ee27cda85630" });
// console.log(response.properties);
let kid = []

let pageIndex = "";
let testCount = 0;

function appendToList(contractCall) {
    contractCall.nfts.forEach(nft => {
        testCount++;
        if (nft.title.includes("that kid")) {
            kid.push(nft.tokenId);
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

console.log("kid ids", kid);

console.log("kid count", kid.length);
console.log(pageIndex);
console.log(testCount);

const final = { kid }

// Write data in 'Output.txt' .
fs.writeFile('./outputs/there-goes-ack.txt', JSON.stringify(final), (err) => {
    // In case of a error throw err.
    if (err) throw err;
})