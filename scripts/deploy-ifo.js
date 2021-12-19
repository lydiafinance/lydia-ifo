const web3 = require("web3");
const inquirer = require("inquirer");
const moment = require("moment");

require("@nomiclabs/hardhat-ethers");

async function main() {

  const [deployer] = await ethers.getSigners();

  let LP_TOKEN = "0x21a735a9c3f00ef3099d6a945f71d148840f4918"; // AVAX-LYD
  let OFFER_TOKEN = "0x33F343fD813f34AE5b18ce0B5C88f3716416cf2C"; // Test token
  let START_TS = "1638996600";
  let END_TS = "1638997200";
  let NEXT_RELEASE_TIMESTAMP = "1638997800";
  let RELEASED_PERCENT = 75;
  const ADMIN = deployer.address;

  if (process.env.HARDHAT_NETWORK === "mainnet") {
    LP_TOKEN = "0x5Fc70cF6A4A858Cf4124013047e408367EBa1ace"; // AVAX-USDT.e
    OFFER_TOKEN = "0x65E50902eD92899d599671b14a6b16f0a5036A7c"; // AVAO
  }

  console.log("Deploying to:", process.env.HARDHAT_NETWORK);

  const balanceRaw = (await deployer.getBalance()).toString();
  const balance = web3.utils.fromWei(balanceRaw);

  console.log("LP_TOKEN: ", LP_TOKEN);
  console.log("OFFER_TOKEN: ", OFFER_TOKEN);
  console.log("START_TS: ", START_TS);
  console.log("END_TS: ", END_TS);
  console.log("RELEASED_PERCENT: ", RELEASED_PERCENT);
  console.log("NEXT_RELEASE_TIMESTAMP: ", NEXT_RELEASE_TIMESTAMP)
  console.log("ADMIN: ", ADMIN);

  console.log("Deploying ifo contract with the account:", deployer.address);
  console.log("Account balance:", balance, "AVAX", "(" + balanceRaw + ")");

  async function deploy() {
    console.log("Deploying...");

    const Ifo = await ethers.getContractFactory("IFO");
    const ifo = await Ifo.deploy(LP_TOKEN, OFFER_TOKEN, START_TS, END_TS, RELEASED_PERCENT, NEXT_RELEASE_TIMESTAMP, ADMIN);
    console.log("Ifo address:", ifo.address);

    console.log("Done 🎉");
  }

  async function cancel() {
    console.log("Cancelled");
  }

  return inquirer
    .prompt([
      {
        "name": "confirm",
        "message": "Continue? (y/n)",
        "validate": (a) => {
          return a === "y" || a === "n";
        }
      }
    ])
    .then(answers => {
      if (answers.confirm === "y") {
        return deploy();
      }

      if (answers.confirm === "n") {
        return cancel();
      }
    });
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
