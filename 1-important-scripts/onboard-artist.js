// Imports
import { Network, Alchemy } from "alchemy-sdk";
import * as dotenv from 'dotenv';
dotenv.config();
import { Client } from "@notionhq/client"
import axios from 'axios';

// Setup notion api
const notion = new Client({ auth: process.env.NOTION_SECRET })
const databaseId = process.env.DATABASE_ID;
const artistDatabaseId = process.env.ARTIST_DB_ID;

// Setup alchemy api
const settings = {
    apiKey: process.env.ALCHEMY, // Replace with your Alchemy API Key.
    network: Network.ETH_MAINNET, // Replace with your network.

};
const alchemy = new Alchemy(settings);

// IMPORTANT: Configure inputs - artist name and an array of contract addresses
const artistName = "DeeKay"
const illiquidSearchQuery = "deekay"


// Setup inital variables for tracking
let contractStorage = {};
let countContracts = 0;
let page1of1 = 1;
const perPage = 200;
let illiquidIndex = {};
let illiquidStorage = {};

// Define the asynchronous function that will retrieve deployed contracts
async function findContractsDeployed(address) {
    const transfers = [];

    // Paginate through the results using getAssetTransfers method
    let response = await alchemy.core.getAssetTransfers({
        fromBlock: "0x0",
        toBlock: "latest", // Fetch results up to the latest block
        fromAddress: address, // Filter results to only include transfers from the specified address
        excludeZeroValue: false, // Include transfers with a value of 0
        category: ["external"], // Filter results to only include external transfers
    });
    transfers.push(...response.transfers);

    // Continue fetching and aggregating results while there are more pages
    while (response.pageKey) {
        let pageKey = response.pageKey;
        response = await alchemy.core.getAssetTransfers({
            fromBlock: "0x0",
            toBlock: "latest",
            fromAddress: address,
            excludeZeroValue: false,
            category: ["external"],
            pageKey: pageKey,
        });
        transfers.push(...response.transfers);
    }

    // Filter the transfers to only include contract deployments (where 'to' is null)
    const deployments = transfers.filter((transfer) => transfer.to === null);
    const txHashes = deployments.map((deployment) => deployment.hash);

    // Fetch the transaction receipts for each of the deployment transactions
    const promises = txHashes.map((hash) =>
        alchemy.core.getTransactionReceipt(hash)
    );

    // Wait for all the transaction receipts to be fetched
    const receipts = await Promise.all(promises);
    const contractAddresses = receipts.map((receipt) => receipt?.contractAddress);
    return contractAddresses;
}

// Takes in a contract call for a 721 contract, and will identify editions
function appendToList(contractCall, contractAddress) {
    contractCall.nfts.forEach(nft => {
        const nftTitle = nft.title.split(" #");
        if (Array.isArray(contractStorage[contractAddress].artIndex[nftTitle[0]])) {
            contractStorage[contractAddress].artIndex[nftTitle[0]].push(nft.tokenId)
        }
        else {
            contractStorage[contractAddress].artIndex[nftTitle[0]] = [nft.tokenId];
            contractStorage[contractAddress].artStorage[nftTitle[0]] = [nft];
            // If there is another # in the title of the NFT (other than identifying the edition number) - we need to throw an error
            if (nftTitle.length == 3) {
                console.log("# found in NFT title!", nft.title)
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
    // Look up information on notion to make prevent duplicate
    const duplicateQuery = await notion.databases.query({
        database_id: databaseId,
        filter: {
            and: [
                {
                    property: 'Edition Name',
                    rich_text:
                    {
                        contains: title
                    }
                },
                {
                    property: 'Contract',
                    rich_text:
                    {
                        contains: address
                    }
                },
            ]
        }
    });

    if (duplicateQuery.results.length > 0) {
        console.log("DUPLICATE FOUND", title, address);
    }
    else {
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
        }
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

    // Query first NFT page from alchemy
    const nftsForContract = await alchemy.nft.getNftsForContract(contractAddress);
    if (nftsForContract.nfts.length > 0) {
        if (nftsForContract.nfts[0].tokenType.includes("721")) {
            // handle the first page of NFTs
            appendToList(nftsForContract, contractAddress);
            while (contractStorage[contractAddress].pageIndex != undefined) {
                console.log("making api call", contractStorage[contractAddress].pageIndex);
                const newContractCall = await alchemy.nft.getNftsForContract(contractAddress, {
                    pageKey: contractStorage[contractAddress].pageIndex
                });
                appendToList(newContractCall, contractAddress);
            }
            console.log("# ID's parsed from", contractAddress, "-", contractStorage[contractAddress].testCount);

            // After all the Alchemy pages have been scraped, loop through each edition
            const artList = Object.keys(contractStorage[contractAddress].artStorage);

            // Request to add each artwork to notion
            await Promise.all(
                artList.map(async (artname) => {
                    const newIDs = detectRange(artname, contractAddress);
                    const artType = (newIDs.split(",").length - 1 > 0 || newIDs.split("-").length - 1 > 0) ? "Edition" : "1of1"

                    console.log(`Attempting to add: ${artname}: ${newIDs}`);
                    const notionConfirmation = await addItem(artname, contractStorage[contractAddress].artStorage[artname][0].tokenType.slice(3), contractStorage[contractAddress].artStorage[artname][0].contract.openSea.collectionName, artistNotionID, contractAddress, newIDs, artType);
                })
            );

            console.log("...");
        }
        else if (nftsForContract.nfts[0].tokenType.includes("1155")) {
            // For 1155s all we need to do is store the edition
            await Promise.all(
                nftsForContract.nfts.map(async (nft) => {
                    console.log("adding", nft.title);
                    const notionConfirmation = await addItem(nft.title, nft.tokenType.slice(3), nft.contract.openSea.collectionName, artistNotionID, contractAddress, nft.tokenId, "Edition");
                })
            );

            contractStorage[contractAddress].pageIndex = nftsForContract.pageKey;
            // Loop through all pages
            while (contractStorage[contractAddress].pageIndex != undefined) {
                console.log("making api call", contractStorage[contractAddress].pageIndex);

                const newContractCall = await alchemy.nft.getNftsForContract(contractAddress, {
                    pageKey: contractStorage[contractAddress].pageIndex
                });

                await Promise.all(
                    newContractCall.nfts.map(async (nft) => {
                        console.log("adding", nft.title);
                        const notionConfirmation = await addItem(nft.title, nft.tokenType.slice(3), nft.contract.openSea.collectionName, artistNotionID, contractAddress, nft.tokenId, "Edition");
                    })
                );

                contractStorage[contractAddress].pageIndex = newContractCall.pageKey;
            }
            console.log("...");
        }
    }
    else {
        console.log(`Contract ${contractAddress} isn't an NFT contract.`);
    }
    countContracts++;
}

// Find all contract deploys by the artist and run the address through handleScraping
async function scrapeDeploys(artistNotionID, artistAddress) {
    const contractAddresses = await findContractsDeployed(artistAddress);

    // Log the contract addresses in a readable format by looping through the array
    console.log(`Scraping NFTs for ${artistName} (${artistNotionID}).`);
    console.log(`The following contracts were deployed by ${artistAddress}:`);
    for (let i = 0; i < contractAddresses.length; i++) {
        console.log(`${i + 1}. ${contractAddresses[i]}`);
    }
    console.log("...");

    // Run the scrape for each contract deployed
    await Promise.all(
        contractAddresses.map(async (contractAddress) => {
            await handleScraping(artistNotionID, contractAddress);
        })
    );
    console.log("Artist Deploys Scraped!");
}

// Helper function for scrapeIlliquid1of1s
async function get1of1s() {
    console.log("1of1 API called. Page #", page1of1);
    const requestURL = `https://alpha.illiquid.xyz/api/trpc/token.seriesByArtist?batch=1&input=%7B%220%22%3A%7B%22json%22%3A%7B%22artistId%22%3A%22${illiquidSearchQuery}%22%2C%22page%22%3A${page1of1}%2C%22perPage%22%3A${perPage}%2C%22sortBy%22%3A%22floor%22%2C%22sortDirection%22%3A%22asc%22%7D%7D%7D`
    console.log(requestURL)
    try {
        const response = await axios.get(requestURL);
        return response.data[0].result.data.json;
    } catch (error) {
        console.error(error);
        return [];
    }
}

// Core function to hit Illiquid's API and find all the 1 of 1 artwork
async function scrapeIlliquid1of1s(artistNotionID) {
    const NFTList = [];
    let returnedNFTs = await get1of1s();

    while (returnedNFTs.length > 0) {
        NFTList.push(...returnedNFTs);
        page1of1 += 1;
        returnedNFTs = await get1of1s();
    }

    await Promise.all(
        NFTList.map(async (nft) => {
            if (nft.metadata.chain === 'ethereum' && nft.metadata.name != null) {
                console.log("Attemping to add", nft.metadata.name);
                const artType = nft.metadata.supply.total > 1 ? "Edition" : "1of1";
                const collection = nft.set.name || "";
                const notionResponse = await addItem(nft.metadata.name, "721", collection, artistNotionID, nft.contractAddress, nft.tokenId, artType);
            }
        })
    );
    console.log("Illiquid 1of1s Scraped!");
}

// Get specific illiquid editions
async function getEditionMetadata(editionID, editionPage) {
    const requestURL = `https://alpha.illiquid.xyz/api/trpc/token.bySet?batch=1&input=%7B%220%22%3A%7B%22json%22%3A%7B%22artistId%22%3A%22${illiquidSearchQuery}%22%2C%22page%22%3A${editionPage}%2C%22setId%22%3A${editionID}%2C%22perPage%22%3A${perPage}%2C%22sortBy%22%3A%22floor%22%2C%22sortDirection%22%3A%22asc%22%7D%7D%7D`
    try {
        const response = await axios.get(requestURL);
        // console.log(response.data[0].result.data.json);
        return response.data[0].result.data.json;
    } catch (error) {
        console.error(error);
        return [];
    }
}

// Helper function to get metadata of illiquid editions
async function scrapeIlliquidEditionsMetadata(edition) {
    const NFTList = [];
    let editionPage = 1;
    console.log(`Set API called for ${edition.set.title} - Page #${editionPage}`);
    let returnedNFTs = await getEditionMetadata(edition.set.id, editionPage);
    while (returnedNFTs.length > 0) {
        NFTList.push(...returnedNFTs);
        editionPage += 1;
        console.log(`Set API called for ${edition.set.title} - Page #${editionPage}`);
        returnedNFTs = await getEditionMetadata(edition.set.id, editionPage);
    }
    return NFTList;
}

// Modified verison of appendtoList specifically for illiquid
function storeEditionMetadata(contractCall) {
    contractCall.forEach(nft => {
        if (nft.metadata.chain === 'ethereum' && nft.metadata.name != null) {
            const nftTitle = nft.metadata.name.split(" #");
            if (Array.isArray(illiquidIndex[nftTitle[0]])) {
                illiquidIndex[nftTitle[0]].push(nft.tokenId)
            }
            else {
                illiquidIndex[nftTitle[0]] = [nft.tokenId];
                illiquidStorage[nftTitle[0]] = nft;
                // If there is another # in the title of the NFT (other than identifying the edition number) - we need to throw an error
                if (nftTitle.length == 3) {
                    console.log("# found in NFT title!", nft.title)
                }
            }
        }
    });
}

// Takes in an array of ints, and detects ranges where the numbers are continous. Needed for 721s.
function detectRangeIlliquid(artName) {
    let idArray = illiquidIndex[artName];
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

// Core function to hit Illiquid's API to find missing edition artwork
async function scrapeIlliquidEditions(artistNotionID) {
    // Get edition sets
    const getIlliquidSetsReq = `https://alpha.illiquid.xyz/_next/data/fO9jsMcCRz9MWZb1OW8K7/creator/${illiquidSearchQuery}.json`;
    const illiquidSets = await axios.get(getIlliquidSetsReq);
    const editionList = illiquidSets.data.pageProps.setStats;

    await Promise.all(
        editionList.map(async (edition) => {
            const editionOutput = await scrapeIlliquidEditionsMetadata(edition);
            storeEditionMetadata(editionOutput);
        })
    );

    const artList = Object.keys(illiquidStorage);

    await Promise.all(
        artList.map(async (artname) => {
            const newIDs = detectRangeIlliquid(artname);
            const tokenType = (newIDs.split(",").length - 1 > 0 || newIDs.split("-").length - 1 > 0) ? "721" : "1155";
            const collection = illiquidStorage[artname].set ? illiquidStorage[artname].set.name : "";
            console.log(`Attempting to add: ${artname}: ${newIDs} (ERC-${tokenType})`);
            const notionResponse = await addItem(artname, tokenType, collection, artistNotionID, illiquidStorage[artname].contractAddress, newIDs, "Edition");
        })
    );

    console.log("Illiquid Editions Scraped!");
}

async function main() {
    // Query the artists notion id from the database
    const artistIDQuery = await notion.databases.query({
        database_id: artistDatabaseId,
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
        const artistAddress = artistIDQuery.results[0].properties['Sign-In Address(es)'].rich_text[0].plain_text;

        // Step 1 - scrape deploys
        await scrapeDeploys(artistNotionID, artistAddress);
        console.log("...");

        // Step 2 - scrape 1 of 1 artworks from illiquid
        await scrapeIlliquid1of1s(artistNotionID);
        console.log("...");

        // Step 3 - scrape editions from illiquid (it's the most unreliable so we want to do this last)
        await scrapeIlliquidEditions(artistNotionID);
        console.log("Artist onboarding finished");
    }
    else {
        console.log("Artist not in Notion!");
    }
}

main();

