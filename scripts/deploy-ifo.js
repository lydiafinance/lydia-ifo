const web3 = require("web3");
const inquirer = require("inquirer");
const moment = require("moment");

require("@nomiclabs/hardhat-ethers");

async function main() {

  const [deployer] = await ethers.getSigners();

  let LP_TOKEN = "0x21a735a9c3f00ef3099d6a945f71d148840f4918"; // AVAX-LYD
  let OFFER_TOKEN = "0x33F343fD813f34AE5b18ce0B5C88f3716416cf2C"; // Test token
  let START_TS = moment.utc().add(10, "days").unix();
  let END_TS = moment.utc().add(11, "days").unix();
  const ADMIN = deployer.address;

  if (process.env.HARDHAT_NETWORK === "mainnet") {
    LP_TOKEN = "0xfba4edaad3248b03f1a3261ad06ad846a8e50765";
    OFFER_TOKEN = "0x65E50902eD92899d599671b14a6b16f0a5036A7c"; // Test token
  }

  console.log("Deploying to:", process.env.HARDHAT_NETWORK);

  const balanceRaw = (await deployer.getBalance()).toString();
  const balance = web3.utils.fromWei(balanceRaw);

  console.log("LP_TOKEN: ", LP_TOKEN);
  console.log("OFFER_TOKEN: ", OFFER_TOKEN);
  console.log("START_TS: ", START_TS);
  console.log("END_TS: ", END_TS);
  console.log("ADMIN: ", ADMIN);

  console.log("Deploying ifo contract with the account:", deployer.address);
  console.log("Account balance:", balance, "AVAX", "(" + balanceRaw + ")");

  async function deploy() {
    console.log("Deploying...");

    const Ifo = await ethers.getContractFactory("IFOV2");
    const ifo = await Ifo.deploy(LP_TOKEN, OFFER_TOKEN, START_TS, END_TS, ADMIN);
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
