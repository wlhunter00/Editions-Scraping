import * as dotenv from 'dotenv';
dotenv.config();
import { Client } from "@notionhq/client"

const notion = new Client({ auth: process.env.NOTION_SECRET })

// Query the artists notion id from the database
const artistIDQuery = await notion.databases.query({
    database_id: "854650ae83f34073b04819c0ecf6378b"
    ,
    filter: {
        and: [
            {
                property: 'Artist Name',
                rich_text:
                {
                    contains: "0010"
                }
            }
        ]
    }
});

async function updateNotionPage(id, pfp, banner, name) {
    try {
        if (pfp && banner) {
            const response = await notion.pages.update({
                page_id: id,
                properties: {
                    'PFP Image (1)': {
                        "files":
                            [
                                {
                                    "type": "external",
                                    "name": `${name}_pfp`,
                                    external: {
                                        "url": pfp,
                                    },
                                }
                            ]

                    },
                    'Banner Image (1)': {
                        "files":
                            [
                                {
                                    "type": "external",
                                    "name": `${name}_banner`,
                                    external: {
                                        "url": banner,
                                    },
                                }
                            ]

                    }
                },
            })
            console.log("Success! Entry updated", name)
        }
        else {
            const response = await notion.pages.update({
                page_id: id,
                properties: {
                    'PFP Image (1)': {
                        "files":
                            [
                                {
                                    "name": `${name}_pfp`,
                                    type: "file",
                                    file: {
                                        "url": pfp,
                                    },
                                }
                            ]

                    }
                },
            })
            console.log("Success! Entry updated", name)
        }
    } catch (error) {
        console.log("Error found when adding", name, "to Notion!");
        console.error(error.body);
        // Pushes error object if there is an issue 
    }
}


artistIDQuery.results.forEach(artist => {
    let pfp = undefined;
    let bannerImage = undefined;

    if (artist.properties["PFP"].files[0]) {
        if (artist.properties["PFP"].files[0].external)
            pfp = artist.properties["PFP"].files[0].external.url
        else if (artist.properties["PFP"].files[0].file) {
            console.log(artist.properties["PFP"].files[0])
            pfp = artist.properties["PFP"].files[0].file.url
        }
    }

    if (artist.properties["Banner Image"].files[0]) {
        if (artist.properties["Banner Image"].files[0].external) {
            bannerImage = artist.properties["Banner Image"].files[0].external.url
        }
        else if (artist.properties["Banner Image"].files[0].file)
            bannerImage = artist.properties["Banner Image"].files[0].file.url
    }
    let id = artist.properties['👨‍👩‍👧‍👦 Escher Artist Database'].relation[0].id;

    const name = artist.properties["Artist Name"].title[0].text.content;

    console.log(id, pfp, bannerImage, name)

    // const artistID = artist.id;
    // // address, description, PFP, banner image, socials
    // const address = artist.properties["Sign-In Address"].rollup.array[0] ? artist.properties["Sign-In Address"].rollup.array[0].rich_text[0].plain_text : "";
    // const description = (artist.properties['Artist Description'].rollup.array[0] && artist.properties['Artist Description'].rollup.array[0].rich_text[0]) ? artist.properties['Artist Description'].rollup.array[0].rich_text[0].plain_text : "";
    // const socials = (artist.properties['Socials'].rollup.array[0] && artist.properties['Socials'].rollup.array[0].rich_text[0]) ? artist.properties['Socials'].rollup.array[0].rich_text[0].plain_text : "";
    // console.log(address, description, socials)
    // // console.log(artist.properties)
    if (pfp)
        updateNotionPage(id, pfp, bannerImage, name);
    console.log("------")
});

// console.log(artistIDQuery.results)