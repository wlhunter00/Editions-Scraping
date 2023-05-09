import * as dotenv from 'dotenv';
dotenv.config();
import { Client } from "@notionhq/client"
import axios from 'axios';

// Setup notion api
const notion = new Client({ auth: process.env.NOTION_SECRET })
const databaseId = process.env.DATABASE_ID;
const artistDatabaseId = process.env.ARTIST_DB_ID;

// Set scraping variables
const artistName = "Dangiuz"
const searchQuery = "Dangiuz"
const scrapeEditons = true;
const scrape1of1s = false;

// Setting web crawling variables
let page1of1 = 1;
const perPage = 200;
let artIndex = {};
let artStorage = {};


async function get1of1s() {
    console.log("1of1 API called. Page #", page1of1);
    const requestURL = `https://alpha.illiquid.xyz/api/trpc/token.seriesByArtist?batch=1&input=%7B%220%22%3A%7B%22json%22%3A%7B%22artistId%22%3A%22${searchQuery}%22%2C%22page%22%3A${page1of1}%2C%22perPage%22%3A${perPage}%2C%22sortBy%22%3A%22floor%22%2C%22sortDirection%22%3A%22asc%22%7D%7D%7D`
    console.log(requestURL)
    try {
        const response = await axios.get(requestURL);
        return response.data[0].result.data.json;
    } catch (error) {
        console.error(error);
        return [];
    }
}

async function scrapeAll1of1s() {
    let NFTList = [];
    let returnedNFTs = await get1of1s();
    while (returnedNFTs.length > 0) {
        NFTList = NFTList.concat(returnedNFTs);
        page1of1 += 1;
        returnedNFTs = await get1of1s();
    }
    return NFTList;
}

async function aggregate1of1s(artistNotionID) {
    const nfts = await scrapeAll1of1s();
    nfts.forEach(nft => {
        if (nft.metadata.chain === 'ethereum' && nft.metadata.name != null) {
            console.log("Attemping to add", nft.metadata.name);
            const artType = nft.metadata.supply.total > 1 ? "Edition" : "1of1";
            const collection = nft.set.name || "";
            addItem(nft.metadata.name, "721", collection, artistNotionID, nft.contractAddress, nft.tokenId, artType);
        }
    });

}

async function getEditions() {
    try {
        console.log("Set API Called")
        const requestURL = `https://alpha.illiquid.xyz/_next/data/fO9jsMcCRz9MWZb1OW8K7/creator/${searchQuery}.json`;
        const response = await axios.get(requestURL);
        return response.data.pageProps.setStats;
    } catch (error) {
        console.error(error);
        return [];
    }
}

async function scrapeAllEditionMetadata(edition) {
    let NFTList = [];
    let editionPage = 1;
    console.log(`Set API called for ${edition.set.title} - Page #${editionPage}`);
    let returnedNFTs = await getEditionMetadata(edition.set.id, editionPage);
    while (returnedNFTs.length > 0) {
        NFTList = NFTList.concat(returnedNFTs);
        editionPage += 1;
        console.log(`Set API called for ${edition.set.title} - Page #${editionPage}`);
        returnedNFTs = await getEditionMetadata(edition.set.id, editionPage);
    }
    return NFTList;
}

async function getEditionMetadata(editionID, editionPage) {
    const requestURL = `https://alpha.illiquid.xyz/api/trpc/token.bySet?batch=1&input=%7B%220%22%3A%7B%22json%22%3A%7B%22artistId%22%3A%22${searchQuery}%22%2C%22page%22%3A${editionPage}%2C%22setId%22%3A${editionID}%2C%22perPage%22%3A${perPage}%2C%22sortBy%22%3A%22floor%22%2C%22sortDirection%22%3A%22asc%22%7D%7D%7D`
    try {
        const response = await axios.get(requestURL);
        // console.log(response.data[0].result.data.json);
        return response.data[0].result.data.json;
    } catch (error) {
        console.error(error);
        return [];
    }
}

// Takes in a contract call for a 721 contract, and will identify editions
function appendToList(contractCall) {
    contractCall.forEach(nft => {
        if (nft.metadata.chain === 'ethereum' && nft.metadata.name != null) {
            const nftTitle = nft.metadata.name.split(" #");
            if (Array.isArray(artIndex[nftTitle[0]])) {
                artIndex[nftTitle[0]].push(nft.tokenId)
            }
            else {
                artIndex[nftTitle[0]] = [nft.tokenId];
                artStorage[nftTitle[0]] = nft;
                // If there is another # in the title of the NFT (other than identifying the edition number) - we need to throw an error
                if (nftTitle.length == 3) {
                    console.log("# found in NFT title!", nft.title)
                }
            }
        }
    });
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
function detectRange(artName) {
    let idArray = artIndex[artName];
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
    try {
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
    catch (err) {
        console.log("Query error", err)
    }
}


async function aggregateEditions(artistNotionID) {
    const editionList = await getEditions();

    await Promise.all(
        editionList.map(async (edition) => {
            const editionOutput = await scrapeAllEditionMetadata(edition);
            appendToList(editionOutput);
        })
    );

    const artList = Object.keys(artStorage);
    artList.forEach(artname => {
        // Take the array of ints for IDs and instead get a string with ranges
        const newIDs = detectRange(artname);
        const tokenType = (newIDs.split(",").length - 1 > 0 || newIDs.split("-").length - 1 > 0) ? "721" : "1155";
        const collection = artStorage[artname].set ? artStorage[artname].set.name : "";
        console.log(`Attempting to add: ${artname}: ${newIDs} (ERC-${tokenType})`);
        addItem(artname, tokenType, collection, artistNotionID, artStorage[artname].contractAddress, newIDs, "Edition");
    });
    console.log("...");
}

async function main() {
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
        console.log(`Scraping NFTs for ${artistName} (${artistNotionID}).`);
        if (scrapeEditons) {
            await aggregateEditions(artistNotionID);
        }
        if (scrape1of1s) {
            await aggregate1of1s(artistNotionID);
        }
    }
}

main();