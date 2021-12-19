const {expect} = require("chai");

const {mine, getBlockTimestamp, toBN, formatBN, ZERO} = require("./util");

let START_TS;
let END_TS;
let NEXT_RELEASE_TS;

/*
This test demonstrates a vault connection
*/

describe("IFO test 4", function () {
  START_TS = Math.floor(Date.now() / 1000) + (86400 * 10); // IFO starts in 10 days
  END_TS = START_TS + 7200 // IFO wil be live for 2 hours
  NEXT_RELEASE_TS = END_TS + 600;

  const startIfo = async () => {
    const currentTs = await getBlockTimestamp();
    await mine(START_TS - currentTs);
  }

  const endIFO = async () => {
    const currentTs = await getBlockTimestamp();
    await mine(END_TS - currentTs);
  }


  it("Test", async function () {
    const accounts = await ethers.getSigners();
    const DEPLOYER = accounts[5];
    const ATYS = accounts[6];
    const LYDUS = accounts[7];
    const MANES = accounts[8];

    // Deploy test tokens
    const Token1 = await ethers.getContractFactory("Token");
    const lpToken = await Token1.connect(DEPLOYER).deploy();
    await lpToken.deployed();
    const lpDec = Number(await lpToken.decimals());

    const Token2 = await ethers.getContractFactory("Token");
    const offeringToken = await Token2.connect(DEPLOYER).deploy();
    await offeringToken.deployed();
    const offeringDec = Number(await offeringToken.decimals());

    const Token3 = await ethers.getContractFactory("Token");
    const vaultToken = await Token3.connect(DEPLOYER).deploy();
    await vaultToken.deployed();
    const vaultTokenDec = Number(await offeringToken.decimals());

    const Vault = await ethers.getContractFactory("Vault");
    const vault = await Vault.connect(DEPLOYER).deploy(vaultToken.address);
    await vault.deployed();

    const depositToVault = async (account, amount) => {
      await vaultToken.functions.mint(account.address, amount);
      await vaultToken.connect(account).functions.approve(vault.address, amount);
      await vault.connect(account).deposit(amount)
    }

    const minVaultBalance = toBN("3250", vaultTokenDec);
    const manesVaultBalance = toBN("1000", vaultTokenDec);
    const lydusVaultBalance = toBN("4290", vaultTokenDec);

    // Deploy ifo contract
    const IFO = await ethers.getContractFactory("IFO");
    const ifo = await IFO.connect(DEPLOYER).deploy(lpToken.address, offeringToken.address, START_TS, END_TS, 100, NEXT_RELEASE_TS, DEPLOYER.address, vault.address, minVaultBalance);
    await ifo.deployed();

    // Check if properties ok
    expect((await ifo.vault())).to.equal(vault.address);
    expect((await ifo.minVaultBalance())).to.equal(minVaultBalance);

    // Users balance should be 0
    expect((await ifo.getUserVaultBalance(MANES.address)).toString()).to.equal("0");
    expect((await ifo.isEligible(MANES.address))).to.equal(false);

    // Deposit some to vault
    await depositToVault(MANES, manesVaultBalance);
    await depositToVault(LYDUS, lydusVaultBalance);

    // Check vault balance
    expect((await ifo.getUserVaultBalance(MANES.address))).to.equal(manesVaultBalance);
    expect((await ifo.getUserVaultBalance(LYDUS.address))).to.equal(lydusVaultBalance);

    // Check if users eligible
    expect((await ifo.isEligible(MANES.address))).to.equal(false);
    expect((await ifo.isEligible(LYDUS.address))).to.equal(true);

    // Admin checks
    await expect(ifo.connect(MANES).setVault(ZERO)).to.be.revertedWith("Ownable: caller is not the owner");
    await expect(ifo.connect(MANES).setMinVaultBalance(100)).to.be.revertedWith("Ownable: caller is not the owner");

    // Update vault properties and check
    await ifo.connect(DEPLOYER).setVault(ZERO);
    expect((await ifo.vault())).to.equal(ZERO);
    await ifo.connect(DEPLOYER).setVault(vault.address);
    expect((await ifo.vault())).to.equal(vault.address);

    await ifo.connect(DEPLOYER).setMinVaultBalance(100);
    expect((await ifo.minVaultBalance()).toString()).to.equal("100");
    await ifo.connect(DEPLOYER).setMinVaultBalance(minVaultBalance);
    expect((await ifo.minVaultBalance())).to.equal(minVaultBalance);

    // Pool 0 offering/raising
    const offering0 = toBN("30000", offeringDec);
    const raising0 = toBN("6000", lpDec);
    const limit0 = toBN("4000", lpDec);

    // Amounts to commit pool0
    const lydusCommits0 = toBN("2250", lpDec);
    const manesCommits0 = toBN("3250", lpDec);

    // Mint tokens to test users
    await lpToken.functions.mint(LYDUS.address, lydusCommits0);
    await lpToken.functions.mint(MANES.address, manesCommits0);

    // Mint offering tokens to admin to use for IFO
    await offeringToken.functions.mint(DEPLOYER.address, offering0);

    // Set pool 0
    await ifo.functions.setPool(offering0, raising0, limit0, false, 0);

    // Approve ifo
    await lpToken.connect(LYDUS).functions.approve(ifo.address, lydusCommits0);
    await lpToken.connect(MANES).functions.approve(ifo.address, manesCommits0);

    // Start ifo, commit tokens
    await startIfo();

    // Lydus has enough vault balance to participate
    await ifo.connect(LYDUS).depositPool(lydusCommits0, 0);

    // Manes hasn't enough vault balance to participate
    await expect(ifo.connect(MANES).depositPool(manesCommits0, 0)).to.be.revertedWith("Not eligible to participate");

    // Can edit vault parameters since IFO has started
    await expect(ifo.connect(DEPLOYER).setVault(ZERO)).to.be.revertedWith("IFO has started");
    await expect(ifo.connect(DEPLOYER).setMinVaultBalance(100)).to.be.revertedWith("IFO has started");
  });
});

