const web3 = require("web3")
const inquirer = require("inquirer")

require("@nomiclabs/hardhat-ethers")

async function main() {
  const [deployer] = await ethers.getSigners()

  console.log("Deploying to:", process.env.HARDHAT_NETWORK)

  const balanceRaw = (await deployer.getBalance()).toString()
  const balance = web3.utils.fromWei(balanceRaw)

  console.log("Deploying Test Token contract with the account:", deployer.address)
  console.log("Account balance:", balance, "AVAX", "(" + balanceRaw + ")")

  async function deploy() {
    console.log("Deploying...")

    const Token = await ethers.getContractFactory("Token")
    const token = await Token.deploy()
    console.log("Token address:", token.address)

    console.log("Done 🎉")
  }

  async function cancel() {
    console.log("Cancelled")
  }

  return inquirer
    .prompt([
      {
        "name": "confirm",
        "message": "Continue? (y/n)",
        "validate": (a) => {
          return a === "y" || a === "n"
        }
      }
    ])
    .then(answers => {
      if (answers.confirm === "y") {
        return deploy()
      }

      if (answers.confirm === "n") {
        return cancel()
      }
    })
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error)
    process.exit(1)
  })
