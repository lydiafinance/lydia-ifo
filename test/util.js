
const toWei = (amount, decimals) => ethers.utils.parseUnits(String(amount), decimals).toString();

const toBN = (amount, decimals) => ethers.utils.parseUnits(String(amount), decimals);

const mine = async (plusTs) => {
  await ethers.provider.send("evm_increaseTime", [plusTs]);
  await ethers.provider.send("evm_mine");
}

const formatBN = (bn, decimals) => ethers.utils.formatUnits(bn, decimals).toString();

const getBlockTimestamp = async () => (await ethers.provider.getBlock("latest")).timestamp;


const ZERO = "0x0000000000000000000000000000000000000000";

module.exports = {toWei, mine, getBlockTimestamp, formatBN, toBN, ZERO};
