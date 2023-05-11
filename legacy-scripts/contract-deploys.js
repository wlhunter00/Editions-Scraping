// Import the necessary modules from the Alchemy SDK
import { Network, Alchemy } from "alchemy-sdk";

// Optional Config object, but defaults to demo api-key and eth-mainnet.
const settings = {
    apiKey: process.env.ALCHEMY, // Replace with your Alchemy API Key.
    network: Network.ETH_MAINNET, // Replace with your network.
};
const alchemy = new Alchemy(settings);

// Replace with the address you want to query the deployed contracts for - can be ENS name or address hash
const contractAddress = "x0r.eth";


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

// Define the main function that will execute the script
async function main() {
    // Call the findContractsDeployed function to retrieve the array of deployed contracts
    const contractAddresses = await findContractsDeployed(address);

    // Log the contract addresses in a readable format by looping through the array
    console.log(`The following contracts were deployed by ${address}:`);
    for (let i = 0; i < contractAddresses.length; i++) {
        console.log(`${i + 1}. ${contractAddresses[i]}`);
    }

    await Promise.all(
        contractAddresses.map(async (contractAddress) => {
            const nftsForContract = await alchemy.nft.getNftsForContract(contractAddress);
            console.log(contractAddress, nftsForContract.nfts.length);
        })
    );
    // const nftsForContract = await alchemy.nft.getNftsForContract("0x645c99a7BF7eA97B772Ac07A12Cf1B90C9F3b09E");
    // console.log(nftsForContract)

}

// Call the main function to start the script
main();