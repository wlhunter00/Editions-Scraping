import * as dotenv from 'dotenv';
dotenv.config();
import { Client } from "@notionhq/client"

const notion = new Client({ auth: process.env.NOTION_SECRET })

// Query the artists notion id from the database
const artistIDQuery = await notion.databases.query({
    database_id: "8c53db8170764a0480cf9bcab3b5233e"
    ,
    filter: {
        and: [
            {
                property: 'Name',
                rich_text:
                {
                    contains: "Xer0x"
                }
            }
        ]
    }
});

async function updateNotionPage(id, address, description, socials) {
    try {
        const response = await notion.pages.update({
            page_id: id,
            properties: {
                'Sign-In Address (1)': {
                    "rich_text": [
                        {
                            "type": "text",
                            "text": {
                                "content": address
                            }
                        },
                    ]
                },
                'Artist Description (1)': {
                    "rich_text": [
                        {
                            "type": "text",
                            "text": {
                                "content": description
                            }
                        },
                    ]
                },
                'Socials (1)': {
                    "rich_text": [
                        {
                            "type": "text",
                            "text": {
                                "content": socials
                            }
                        },
                    ]
                }
            },
        })
        console.log("Success! Entry updated", id)
    } catch (error) {
        console.log("Error found when adding", id, "to Notion!");
        console.error(error.body);
        // Pushes error object if there is an issue 
    }
}


artistIDQuery.results.forEach(artist => {
    const artistID = artist.id;
    // address, description, PFP, banner image, socials
    const address = artist.properties["Sign-In Address"].rollup.array[0] ? artist.properties["Sign-In Address"].rollup.array[0].rich_text[0].plain_text : "";
    const description = (artist.properties['Artist Description'].rollup.array[0] && artist.properties['Artist Description'].rollup.array[0].rich_text[0]) ? artist.properties['Artist Description'].rollup.array[0].rich_text[0].plain_text : "";
    const socials = (artist.properties['Socials'].rollup.array[0] && artist.properties['Socials'].rollup.array[0].rich_text[0]) ? artist.properties['Socials'].rollup.array[0].rich_text[0].plain_text : "";
    console.log(address, description, socials)
    // console.log(artist.properties)
    if (address)
        updateNotionPage(artistID, address, description, socials);
    console.log("------")
});

// console.log(artistIDQuery.results)