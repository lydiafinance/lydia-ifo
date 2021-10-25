
const toWei = (amount, decimals) => ethers.utils.parseUnits(String(amount), decimals).toString();

const mine = async (plusTs) => {
  await ethers.provider.send("evm_increaseTime", [plusTs]);
  await ethers.provider.send("evm_mine");
}

const getBlockTimestamp = async () => (await ethers.provider.getBlock("latest")).timestamp;

module.exports = {toWei, mine, getBlockTimestamp};
