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
const contractAddress = "0xd78afb925a21f87fa0e35abae2aead3f70ced96b";
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
let girl = []
let store = []
let pageIndex = "";
let testCount = 0;

function appendToList(contractCall) {
    contractCall.nfts.forEach(nft => {
        testCount++;
        if (nft.title.includes("girl")) {
            girl.push(nft.tokenId);
        }
        else if (nft.title.includes("Store")) {
            store.push(nft.tokenId);
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

console.log("girl ids", girl);
console.log("store ids", store);

console.log("girl count", girl.length);
console.log("store count", store.length);
console.log(pageIndex);
console.log(testCount);

const final = { girl, store }

// Write data in 'Output.txt' .
fs.writeFile('./outputs/grails-grant-ack.txt', JSON.stringify(final), (err) => {
    // In case of a error throw err.
    if (err) throw err;
})