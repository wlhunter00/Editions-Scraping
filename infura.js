// Import the libraries and load the environment variables.
import { config as loadEnv } from 'dotenv';
import { SDK, Auth, TEMPLATES, Metadata } from '@infura/sdk';
loadEnv();

// Create Auth object
const auth = new Auth({
    projectId: process.env.INFURA_API_KEY,
    secretId: process.env.INFURA_API_KEY_SECRET,
    privateKey: process.env.WALLET_PRIVATE_KEY,
    chainId: 1,
});

// Instantiate SDK
const sdk = new SDK(auth);

const nfts = await sdk.api.getNFTsForCollection({
    contractAddress: '0x41A322b28D0fF354040e2CbC676F0320d8c8850d',
});
console.log('nfts:', nfts);