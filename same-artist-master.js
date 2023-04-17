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
const artistName = "Coldie"
const contractAddressList = ["0xe9662B4E55b5feEF13ca7067f319562142BD1681"];

// Setup inital variables for tracking
let contractStorage = {};
let errorTokens = [];
let countContracts = 0;

// Takes in a contract call for a 721 contract, and will identify editions
function appendToList(contractCall, contractAddress) {
    contractCall.nfts.forEach(nft => {
        const nftTitle = nft.title.split(" #");
        if (Array.isArray(contractStorage[contractAddress].artIndex[nftTitle[0]])) {
            contractStorage[contractAddress].artIndex[nftTitle[0]].push(parseInt(nft.tokenId))
        }
        else {
            contractStorage[contractAddress].artIndex[nftTitle[0]] = [parseInt(nft.tokenId)];
            contractStorage[contractAddress].artStorage[nftTitle[0]] = [nft];
            // If there is another # in the title of the NFT (other than identifying the edition number) - we need to throw an error
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
}

// Helper function for detectRange
function returnLastElement(arr, j, n) {
    arr.sort(function (a, b) { return a - b });

    for (let i = j; i < n; i++)
        if (arr[i] - arr[i - 1] != 1)
            return i - 1;

    return n - 1;
}

// Takes in an array of ints, and detects ranges where the numbers are continous. Needed for 721s.
function detectRange(artName, contractAddress) {
    let idArray = contractStorage[contractAddress].artIndex[artName];
    let megaString = "";
    let endPoint = -1;
    idArray.sort(function (a, b) { return a - b });

    while (endPoint != idArray.length - 1) {
        const newBegin = endPoint + 2;
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
}

// Function to add art into notion db
// Eventually we will want to upload directly to the database and cut out notion
async function addItem(title, tokenType, collection, artistID, address, tokenIDs, artType) {
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
                        'name': artType
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

// Core function. Takes in the artist and the contract address
async function handleScraping(artistNotionID, contractAddress) {
    // contract storage stores key variables for each contract
    contractStorage[contractAddress] = {
        pageIndex: "",
        testCount: 0,
        artIndex: {},
        artStorage: {}
    };

    console.log("fetching NFTs for contract address:", contractAddress);
    console.log("...");

    // Query first NFT page from alchemy
    const nftsForContract = await alchemy.nft.getNftsForContract(contractAddress);

    if (nftsForContract.nfts[0].tokenType.includes("721")) {
        // handle the first page of NFTs
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

        // After all the Alchemy pages have been scraped, loop through each edition
        const artList = Object.keys(contractStorage[contractAddress].artStorage);
        artList.forEach(artname => {
            // Take the array of ints for IDs and instead get a string with ranges
            const newIDs = detectRange(artname, contractAddress);
            console.log(`${artname}: ${newIDs}`);
            const artType = newIDs.split(",").length - 1 > 0 ? "Edition" : "1of1"
            addItem(artname, contractStorage[contractAddress].artStorage[artname][0].tokenType.slice(3), contractStorage[contractAddress].artStorage[artname][0].contract.openSea.collectionName, artistNotionID, contractAddress, newIDs, artType);
        });
        console.log("...");
    }
    else if (nftsForContract.nfts[0].tokenType.includes("1155")) {
        // For 1155s all we need to do is store the edition
        nftsForContract.nfts.forEach(nft => {
            console.log("adding", nft.title);
            addItem(nft.title, nft.tokenType.slice(3), nft.contract.openSea.collectionName, artistNotionID, contractAddress, nft.tokenId, "Edition");
        });
        contractStorage[contractAddress].pageIndex = nftsForContract.pageKey;
        // Loop through all pages
        while (contractStorage[contractAddress].pageIndex != undefined) {
            console.log("making api call", contractStorage[contractAddress].pageIndex);
            console.log("...");

            const newContractCall = await alchemy.nft.getNftsForContract(contractAddress, {
                pageKey: contractStorage[contractAddress].pageIndex
            });
            newContractCall.nfts.forEach(nft => {
                console.log("adding", nft.title);
                addItem(nft.title, nft.tokenType.slice(3), nft.contract.openSea.collectionName, artistNotionID, contractAddress, nft.tokenId, "Edition");
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
    // Query the artists notion id from the database
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

    // Only scrape if the artist exists
    if (artistIDQuery.results[0]) {
        const artistNotionID = artistIDQuery.results[0].id;
        console.log(`Scraping NFTs for ${artistName} (${artistNotionID}). ${contractAddressList.length} contract addresses have been provided.`);
        console.log("...");

        // Run the scrape for each contract in array
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

