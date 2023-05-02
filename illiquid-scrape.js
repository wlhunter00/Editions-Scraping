import * as dotenv from 'dotenv';
dotenv.config();
import { Client } from "@notionhq/client"
import axios from 'axios';

// Setup notion api
const notion = new Client({ auth: process.env.NOTION_SECRET })
const databaseId = process.env.DATABASE_ID;
const artistDatabaseId = process.env.ARTIST_DB_ID;

// Set scraping variables
const artistName = "Killer Acid"
const searchQuery = "killeracid"

// Setting web crawling variables
let page = 1;
const perPage = 200;


async function getNFTs() {
    console.log("API called. Page #", page);
    const requestURL = `https://alpha.illiquid.xyz/api/trpc/token.seriesByArtist?batch=1&input=%7B%220%22%3A%7B%22json%22%3A%7B%22artistId%22%3A%22${searchQuery}%22%2C%22page%22%3A${page}%2C%22perPage%22%3A${perPage}%2C%22sortBy%22%3A%22floor%22%2C%22sortDirection%22%3A%22asc%22%7D%7D%7D`
    try {
        const response = await axios.get(requestURL);
        return response.data[0].result.data.json;
    } catch (error) {
        console.error(error);
        return [];
    }
}

async function scrapeAllNFTs() {
    let NFTList = [];
    let returnedNFTs = await getNFTs();
    while (returnedNFTs.length > 0) {
        NFTList = NFTList.concat(returnedNFTs);
        page += 1;
        returnedNFTs = await getNFTs();
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
            // Pushes error object if there is an issue 
            errorTokens.push({
                title: title,
                contractAddress: address,
                tokenId: tokenIDs
            });
        }
    }
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

        const nfts = await scrapeAllNFTs();
        nfts.forEach(nft => {
            if (nft.metadata.chain === 'ethereum') {
                console.log("Attemping to add", nft.metadata.name);
                const artType = nft.metadata.supply.total > 1 ? "Edition" : "1of1";
                addItem(nft.metadata.name, "721", nft.set.name, artistNotionID, nft.contractAddress, nft.tokenId, artType);
            }
        });
    }
}

main();