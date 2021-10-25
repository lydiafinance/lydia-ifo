require("@nomiclabs/hardhat-waffle");
require("@nomiclabs/hardhat-ethers");

const ACCOUNT = process.env.ACCOUNT || "0x0000000000000000000000000000000000000000";


/**
 * @type import('hardhat/config').HardhatUserConfig
 */
module.exports = {
  solidity: {
    compilers: [
      {
        version: "0.6.12",
        settings: {
          optimizer: {
            enabled: true,
            runs: 200
          }
        }
      },
    ],
  },
  networks: {
    hardhat: {
      gasPrice: 470000000000,
      chainId: 43112,
      initialDate: Date(),
      accounts:{
        count: 100
      }
    },
    fuji: {
      url: "https://api.avax-test.network/ext/bc/C/rpc",
      gasPrice: 470000000000,
      chainId: 43113,
      accounts: [ACCOUNT],
    },
    mainnet: {
      url: "https://api.avax.network/ext/bc/C/rpc",
      gasPrice: 75000000000,
      chainId: 43114,
      accounts: [ACCOUNT],
    },
  },
};
