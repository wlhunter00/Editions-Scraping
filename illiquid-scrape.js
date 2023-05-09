import * as dotenv from 'dotenv';
dotenv.config();
import { Client } from "@notionhq/client"
import axios from 'axios';

// Setup notion api
const notion = new Client({ auth: process.env.NOTION_SECRET })
const databaseId = process.env.DATABASE_ID;
const artistDatabaseId = process.env.ARTIST_DB_ID;

// Set scraping variables
const artistName = "DeeKay"
const searchQuery = "deekay"

// Setting web crawling variables
let page = 1;
const perPage = 200;


async function get1of1s() {
    console.log("API called. Page #", page);
    const requestURL = `https://alpha.illiquid.xyz/api/trpc/token.seriesByArtist?batch=1&input=%7B%220%22%3A%7B%22json%22%3A%7B%22artistId%22%3A%22${searchQuery}%22%2C%22page%22%3A${page}%2C%22perPage%22%3A${perPage}%2C%22sortBy%22%3A%22floor%22%2C%22sortDirection%22%3A%22asc%22%7D%7D%7D`
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
        page += 1;
        returnedNFTs = await get1of1s();
    }
    return NFTList;
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

async function find1of1s() {
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
}

find1of1s();