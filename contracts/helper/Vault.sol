pragma solidity ^0.6.12;

import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";

contract Vault {
    using SafeERC20 for IERC20;
    using SafeMath for uint256;

    IERC20 public immutable token;

    struct UserInfo {
        uint256 shares;
    }

    mapping(address => UserInfo) public userInfo;

    uint256 public totalShares;

    constructor(
        IERC20 _token
    ) public {
        token = _token;
    }

    function deposit(uint256 _amount) external {
        require(_amount > 0, "Nothing to deposit");

        uint256 pool = balanceOf();
        token.safeTransferFrom(msg.sender, address(this), _amount);
        uint256 currentShares = 0;
        if (totalShares != 0) {
            currentShares = (_amount.mul(totalShares)).div(pool);
        } else {
            currentShares = _amount;
        }
        UserInfo storage user = userInfo[msg.sender];

        user.shares = user.shares.add(currentShares);
        totalShares = totalShares.add(currentShares);
    }

    function getPricePerFullShare() external view returns (uint256) {
        return totalShares == 0 ? 1e18 : balanceOf().mul(1e18).div(totalShares);
    }

    function sharesOf(address account) public view returns (uint256) {
        UserInfo storage user = userInfo[account];

        return user.shares;
    }

    function balanceOf() public view returns (uint256) {
        uint256 amount = 125421300000000000000; // some value to demonstrate masterchef connection
        return token.balanceOf(address(this));
    }
}