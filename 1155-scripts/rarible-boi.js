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
const contractAddress = "0xd07dc4262BCDbf85190C01c996b4C06a461d2430";
const artistNotionID = "82a2413a79634462bf293c132f51f31b";

let pageIndex = "";
let testCount = 0;
let artIndex = {};
let artStorage = {}

function appendToList(contractCall) {
    contractCall.nfts.forEach(nft => {
        // console.log(nft);
        if (nft.title.includes("#boi")) {
            console.log(nft.title);
            testCount++;
            addItem(nft.title, nft.tokenType.slice(3), nft.contract.openSea.collectionName, artistNotionID, nft.contract.address, nft.tokenId);
        }
    })
    pageIndex = contractCall.pageKey;
    // console.log("setting key", contractCall);
}

function returnLastElement(arr, j, n) {
    arr.sort(function (a, b) { return a - b });

    for (let i = j; i < n; i++)
        if (arr[i] - arr[i - 1] != 1)
            return i - 1;

    return n - 1;
}

function detectRange(artName) {
    let idArray = artIndex[artName];
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

// Function to add art into notion db
// Eventually we will want to upload directly to the database and cut out notion
async function addItem(title, tokenType, collection, artistID, address, tokenIDs) {
    console.log(title, tokenType, collection, artistID, address, tokenIDs);
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
                'Artwork Category': {
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
        console.log("Success! Entry added.", title)
    } catch (error) {
        console.log("Error found when adding", title, "to Notion!");
        console.error(error.body);
        // Pushes error object if there is an issue 
        errorTokens.push({
            title: title,
            contractAddress: address,
            tokenId: tokenIDs
        });
    }
}

// const response = await notion.pages.retrieve({ page_id: "ef408f17-ee65-4008-91db-ee27cda85630" });
// console.log(response.properties);

console.log("fetching NFTs for contract address:", contractAddress);
console.log("...");

// Print total NFT count returned in the response:
const nftsForContract = await alchemy.nft.getNftsForContract(contractAddress);

appendToList(nftsForContract);
while (pageIndex != undefined) {
    console.log("making api call", pageIndex);
    const newContractCall = await alchemy.nft.getNftsForContract(contractAddress, {
        pageKey: pageIndex
    });
    appendToList(newContractCall);
}

console.log(testCount);

// const artList = Object.keys(artStorage);
// artList.forEach(artname => {
//     console.log(artname, artStorage[artname][0].tokenType.slice(3), artStorage[artname][0].contract.openSea.collectionName, artistNotionID, artStorage[artname][0].contract.address, artStorage[artname][0].tokenId);
//     addItem(artname, artStorage[artname][0].tokenType.slice(3), artStorage[artname][0].contract.openSea.collectionName, artistNotionID, artStorage[artname][0].contract.address, artStorage[artname][0].tokenId);
// });
