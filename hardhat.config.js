require("@nomiclabs/hardhat-waffle");

module.exports = {
  networks: {
    hardhat: {
      loggingEnabled: false,
      mining: {
        auto: true,
        interval: 100
      }
    },
    eth: {
      url: '',
      chainId: 1
    },
    bnb: {
      url: '',
      chainId: 56
    },
    supernova: {
      url: '',
      chainId: 74506
    }
  },
  defaultNetwork: "hardhat",
  solidity: {
    compilers: [
      {
        version: "0.4.18",
        settings: {
          optimizer: {
            enabled: true,
            runs: 10000
          }
        }
      },
      {
        version: "0.8.24",
        settings: {
          optimizer: {
            enabled: true,
            runs: 10000
          }
        }
      }
      ]
  }
};