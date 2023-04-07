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
const contractAddress = "0x4D232CD85294Acd53Ec03F4A57F57888c9Ea1946";
const artistNotionID = "82a2413a79634462bf293c132f51f31b";

let pageIndex = "";
let testCount = 0;
let apiCalls = 0;
let artIndex = {};
let artStorage = {}

function appendToList(contractCall) {
    contractCall.nfts.forEach(nft => {
        testCount++;
        const nftTitle = nft.title.split(" #");
        if (nft.rawMetadata.attributes && nft.rawMetadata.attributes[0]) {
            // console.log(nft.rawMetadata.attributes[0].value)
            if (nft.rawMetadata.attributes[0].value.includes("Lirona")) {
                console.log(nftTitle)
                if (Array.isArray(artIndex[nftTitle[0]])) {
                    artIndex[nftTitle[0]].push(parseInt(nft.tokenId))
                }
                else {
                    artIndex[nftTitle[0]] = [parseInt(nft.tokenId)];
                    artStorage[nftTitle[0]] = [nft];
                }
            }
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
    apiCalls++;
    console.log("making api call", pageIndex, apiCalls);
    const newContractCall = await alchemy.nft.getNftsForContract(contractAddress, {
        pageKey: pageIndex
    });
    appendToList(newContractCall);
}

console.log(testCount);

const artList = Object.keys(artStorage);
artList.forEach(artname => {
    const newIDs = detectRange(artname);
    setTimeout(() => {
        addItem(artname, artStorage[artname][0].tokenType.slice(3), artStorage[artname][0].contract.openSea.collectionName, artistNotionID, contractAddress, newIDs);
    }, 5000);
});
