// Imports
import { Network, Alchemy } from "alchemy-sdk";
import * as dotenv from 'dotenv';
dotenv.config();
import { Client } from "@notionhq/client"
import * as fs from 'fs';

// Setup notion api
const notion = new Client({ auth: process.env.NOTION_SECRET })
const databaseId = process.env.DATABASE_ID

// Setup alchemy api
const settings = {
    apiKey: process.env.ALCHEMY, // Replace with your Alchemy API Key.
    network: Network.ETH_MAINNET, // Replace with your network.

};
const alchemy = new Alchemy(settings);

// IMPORTANT: Configure inputs - artist name and an array of contract addresses
const artistName = "Alpha Centauri Kid"
const contractAddressList = ["0x9f803635a5af311d9a3b73132482a95eb540f71a", "0xd33bc0af2dc4e39cbaef4beff8d1fb3c00c2e7a3"];

let contractStorage = {};
let errorTokens = [];
let countContracts = 0;

function appendToList(contractCall, contractAddress) {
    contractCall.nfts.forEach(nft => {
        const nftTitle = nft.title.split(" #");
        if (Array.isArray(contractStorage[contractAddress].artIndex[nftTitle[0]])) {
            contractStorage[contractAddress].artIndex[nftTitle[0]].push(parseInt(nft.tokenId))
        }
        else {
            contractStorage[contractAddress].artIndex[nftTitle[0]] = [parseInt(nft.tokenId)];
            contractStorage[contractAddress].artStorage[nftTitle[0]] = [nft];
            if (nftTitle.length == 3) {
                console.log("# found in NFT title!", nft.title)
                errorTokens.push({
                    title: nft.title,
                    contractAddress: contractAddress,
                    tokenId: nft.tokenId
                });
            }
        }
        contractStorage[contractAddress].testCount++;
    });
    contractStorage[contractAddress].pageIndex = contractCall.pageKey;
    // console.log("setting key", contractCall);
}

function returnLastElement(arr, j, n) {
    arr.sort(function (a, b) { return a - b });

    for (let i = j; i < n; i++)
        if (arr[i] - arr[i - 1] != 1)
            return i - 1;

    return n - 1;
}

function detectRange(artName, contractAddress) {
    let idArray = contractStorage[contractAddress].artIndex[artName];
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
        console.log("Success! Entry added.", title)
    } catch (error) {
        console.log("Error found when adding", title, "to Notion!");
        console.error(error.body);
        errorTokens.push({
            title: title,
            contractAddress: address,
            tokenId: tokenIDs
        });
    }
}

async function handleScraping(artistNotionID, contractAddress) {
    contractStorage[contractAddress] = {
        pageIndex: "",
        testCount: 0,
        artIndex: {},
        artStorage: {}
    };

    console.log("fetching NFTs for contract address:", contractAddress);
    console.log("...");

    // Query first NFT page
    const nftsForContract = await alchemy.nft.getNftsForContract(contractAddress);

    if (nftsForContract.nfts[0].tokenType.includes("721")) {
        appendToList(nftsForContract, contractAddress);
        while (contractStorage[contractAddress].pageIndex != undefined) {
            console.log("making api call", contractStorage[contractAddress].pageIndex);
            console.log("...");
            const newContractCall = await alchemy.nft.getNftsForContract(contractAddress, {
                pageKey: contractStorage[contractAddress].pageIndex
            });
            appendToList(newContractCall, contractAddress);
        }
        console.log("# ID's parsed from", contractAddress, "-", contractStorage[contractAddress].testCount);

        const artList = Object.keys(contractStorage[contractAddress].artStorage);
        artList.forEach(artname => {
            const newIDs = detectRange(artname, contractAddress);
            console.log(`${artname}: ${newIDs}`);
            addItem(artname, contractStorage[contractAddress].artStorage[artname][0].tokenType.slice(3), contractStorage[contractAddress].artStorage[artname][0].contract.openSea.collectionName, artistNotionID, contractAddress, newIDs);
        });
        console.log("...");
    }
    else if (nftsForContract.nfts[0].tokenType.includes("1155")) {
        nftsForContract.nfts.forEach(nft => {
            addItem(nft.title, nft.tokenType.slice(3), nft.contract.openSea.collectionName, artistNotionID, contractAddress, nft.tokenId);
        });

        contractStorage[contractAddress].pageIndex = nftsForContract.pageKey;
        while (contractStorage[contractAddress].pageIndex != undefined) {
            console.log("making api call", contractStorage[contractAddress].pageIndex);
            console.log("...");
            const newContractCall = await alchemy.nft.getNftsForContract(contractAddress, {
                pageKey: contractStorage[contractAddress].pageIndex
            });

            newContractCall.nfts.forEach(nft => {
                addItem(nft.title, nft.tokenType.slice(3), nft.contract.openSea.collectionName, artistNotionID, contractAddress, nft.tokenId);
            });

            contractStorage[contractAddress].pageIndex = newContractCall.pageKey;
        }

        console.log("...");
    }
    else {
        console.log(`Contract ${contractAddress} isn't an NFT contract.`);
    }
    countContracts++;
}

async function main() {
    const artistIDQuery = await notion.databases.query({
        database_id: "8c53db8170764a0480cf9bcab3b5233e",
        filter: {
            and: [
                {
                    property: 'Name',
                    rich_text:
                    {
                        contains: artistName
                    }
                }
            ]
        }
    });

    if (artistIDQuery.results[0]) {
        const artistNotionID = artistIDQuery.results[0].id;
        console.log(`Scraping NFTs for ${artistName} (${artistNotionID}). ${contractAddressList.length} contract addresses have been provided.`);
        console.log("...");

        contractAddressList.forEach(async contractAddress => {
            await handleScraping(artistNotionID, contractAddress);
            if (countContracts == contractAddressList.length && errorTokens.length > 0) {
                console.log("Errors found!:", errorTokens);
                const timestamp = parseInt((new Date().getTime() / 1000).toFixed(0));
                console.log(timestamp);
                // Write error to log
                fs.writeFile(`./error-outputs/${timestamp}.txt`, JSON.stringify(errorTokens), (err) => {
                    if (err) throw err;
                });
            }
        });
    }
    else {
        console.log("Artist not in Notion!");
    }
}

main();

