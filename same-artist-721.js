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
const contractAddress = "0x0825F050E9B021A0E9de8CB1fb10b6C9F41e834C";
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

console.log("fetching NFTs for contract address:", contractAddress);
console.log("...");

// Print total NFT count returned in the response:
const nftsForContract = await alchemy.nft.getNftsForContract(contractAddress);

nftsForContract.nfts.forEach(nft => {
    addItem(nft.title, nft.tokenType.slice(3), nft.contract.openSea.collectionName, artistNotionID, contractAddress, nft.tokenId);
});
