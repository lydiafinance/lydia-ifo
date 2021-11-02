pragma solidity ^0.6.12;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";

/**
 * @title IFO
 * @notice IFO contract with extended offering token release plan.
 */
contract IFO is ReentrancyGuard, Ownable {
    using SafeMath for uint256;
    using SafeERC20 for IERC20;

    // The LP token used
    IERC20 public lpToken;

    // The offering token
    IERC20 public offeringToken;

    // Number of pools
    uint8 public constant numberPools = 2;

    // The timestamp when IFO starts
    uint256 public startTimestamp;

    // The timestamp when IFO ends
    uint256 public endTimestamp;

    // Released percent of offering tokens.
    uint256 public releasedPercent;

    // Next token release timestamp. Purpose of this to show the next token release date on the UI.
    uint256 public nextReleaseTimestamp;

    // A flag to know if the admin withdrawn raising amount.
    bool public raisedWithdrawn;

    // Array of PoolCharacteristics of size numberPools
    PoolCharacteristics[numberPools] private _poolInformation;

    // It maps the address to pool id to UserInfo
    mapping(address => mapping(uint8 => UserInfo)) private _userInfo;

    // Struct that contains each pool characteristics
    struct PoolCharacteristics {
        uint256 raisingAmountPool; // amount of tokens raised for the pool (in LP tokens)
        uint256 offeringAmountPool; // amount of tokens offered for the pool (in offeringTokens)
        uint256 limitPerUserInLP; // limit of tokens per user (if 0, it is ignored)
        bool hasTax; // tax on the overflow (if any, it works with _calculateTaxOverflow)
        uint256 totalAmountPool; // total amount pool deposited (in LP tokens)
        uint256 sumTaxesOverflow; // total taxes collected (starts at 0, increases with each harvest if overflow)
    }

    // Struct that contains each user information for both pools
    struct UserInfo {
        uint256 amountPool; // How many tokens the user has provided for pool
        bool claimedPool; // Whether the user has claimed (default: false) for pool
        uint256 purchasedTokens; // Total purchased offering tokens amount by the user
        uint256 claimedTokens; // Total claimed offering tokens amount by the user
    }

    // Admin withdraw events
    event AdminWithdraw(uint256 amountLP, uint256 amountOfferingToken);

    // Admin recovers token
    event AdminTokenRecovery(address tokenAddress, uint256 amountTokens);

    // Deposit event
    event Deposit(address indexed user, uint256 amount, uint8 indexed pid);

    // First harvest event
    event FirstHarvest(address indexed user, uint256 claimedAmount, uint256 excessAmount, uint8 indexed pid);

    // Harvest event
    event Harvest(address indexed user, uint256 claimedAmount, uint8 indexed pid);

    // Event for new start & end timestamps
    event NewStartAndEndTimestamps(uint256 startTimestamp, uint256 endTimestamp);

    // Event when parameters are set for one of the pools
    event PoolParametersSet(uint256 offeringAmountPool, uint256 raisingAmountPool, uint8 pid);

    // Event when tokens unlocked
    event TokensReleased(uint256 releasedPercent, uint256 nextReleaseTimestamp);

    // Modifier to prevent contracts to participate
    modifier notContract() {
        require(!_isContract(msg.sender), "contract not allowed");
        require(msg.sender == tx.origin, "proxy contract not allowed");
        _;
    }

    /**
     * @notice It initializes the contract (for proxy patterns)
     * @dev It can only be called once.
     * @param _lpToken: the LP token used
     * @param _offeringToken: the token that is offered for the IFO
     * @param _startTimestamp: the start timestamp for the IFO
     * @param _endTimestamp: the end timestamp for the IFO
     * @param _releasedPercent: Percent of offering tokens that participants claim right after the IFO ends
     * @param _nextReleaseTimestamp: Time of the second releasedPercent update
     * @param _adminAddress: the admin address for handling tokens
     */
    constructor(
        IERC20 _lpToken,
        IERC20 _offeringToken,
        uint256 _startTimestamp,
        uint256 _endTimestamp,
        uint256 _releasedPercent,
        uint256 _nextReleaseTimestamp,
        address _adminAddress
    ) public {
        require(_lpToken.totalSupply() >= 0);
        require(_offeringToken.totalSupply() >= 0);
        require(_lpToken != _offeringToken, "Tokens must be be different");
        require(_releasedPercent > 0 && _releasedPercent <= 100, "Release percent must be in range 1-100");
        require(_nextReleaseTimestamp > _endTimestamp, "Next release time must be greater than IFO end time");

        lpToken = _lpToken;
        offeringToken = _offeringToken;
        startTimestamp = _startTimestamp;
        endTimestamp = _endTimestamp;
        releasedPercent = _releasedPercent; // First offering token release will be made once IFO ends
        nextReleaseTimestamp = _nextReleaseTimestamp;

        transferOwnership(_adminAddress);
    }

    /**
     * @notice It allows users to deposit LP tokens to pool
     * @param _amount: the number of LP token used (18 decimals)
     * @param _pid: pool id
     */
    function depositPool(uint256 _amount, uint8 _pid) external nonReentrant notContract {
        // Checks whether the pool id is valid
        require(_pid < numberPools, "Non valid pool id");

        // Checks that pool was set
        require(
            _poolInformation[_pid].offeringAmountPool > 0 && _poolInformation[_pid].raisingAmountPool > 0,
            "Pool not set"
        );

        // Checks whether the time is not too early
        require(block.timestamp > startTimestamp, "Too early");

        // Checks whether the time is not too late
        require(block.timestamp < endTimestamp, "Too late");

        // Checks that the amount deposited is not inferior to 0
        require(_amount > 0, "Amount must be > 0");

        // Transfers funds to this contract
        lpToken.safeTransferFrom(address(msg.sender), address(this), _amount);

        // Update the user status
        _userInfo[msg.sender][_pid].amountPool = _userInfo[msg.sender][_pid].amountPool.add(_amount);

        // Check if the pool has a limit per user
        if (_poolInformation[_pid].limitPerUserInLP > 0) {
            // Checks whether the limit has been reached
            require(
                _userInfo[msg.sender][_pid].amountPool <= _poolInformation[_pid].limitPerUserInLP,
                "New amount above user limit"
            );
        }

        // Updates the totalAmount for pool
        _poolInformation[_pid].totalAmountPool = _poolInformation[_pid].totalAmountPool.add(_amount);

        emit Deposit(msg.sender, _amount, _pid);
    }

    /**
     * @notice It allows users to harvest from pool
     * @param _pid: pool id
     */
    function harvestPool(uint8 _pid) external nonReentrant notContract {
        // Checks whether it is too early to harvest
        require(block.timestamp > endTimestamp, "Too early to harvest");

        // Checks whether pool id is valid
        require(_pid < numberPools, "Non valid pool id");

        // Checks whether the user has participated
        require(_userInfo[msg.sender][_pid].amountPool > 0, "Did not participate");

        // Harvesting for the first time
        if (!_userInfo[msg.sender][_pid].claimedPool) {

            // Initialize the variables for offering, refunding user amounts, and tax amount
            uint256 offeringTokenAmount;
            uint256 claimableTokenAmount;
            uint256 refundingTokenAmount;
            uint256 userTaxOverflow;

            (offeringTokenAmount, refundingTokenAmount, userTaxOverflow) = _calculateOfferingAndRefundingAmountsPool(
                msg.sender,
                _pid
            );

            // Update user's purchased token amount and mark it as claimed
            _userInfo[msg.sender][_pid].purchasedTokens = offeringTokenAmount;
            _userInfo[msg.sender][_pid].claimedPool = true;

            // Claimable offering tokens
            claimableTokenAmount = offeringTokenAmount > 0 ? _claimableTokens(address(msg.sender), _pid) : 0;

            // Update user info for next harvests
            _userInfo[msg.sender][_pid].claimedTokens = claimableTokenAmount;

            // Increment the sumTaxesOverflow
            if (userTaxOverflow > 0) {
                _poolInformation[_pid].sumTaxesOverflow = _poolInformation[_pid].sumTaxesOverflow.add(userTaxOverflow);
            }

            // Transfer these tokens back to the user if quantity > 0
            if (claimableTokenAmount > 0) {
                offeringToken.safeTransfer(address(msg.sender), claimableTokenAmount);
            }

            if (refundingTokenAmount > 0) {
                lpToken.safeTransfer(address(msg.sender), refundingTokenAmount);
            }

            emit FirstHarvest(msg.sender, claimableTokenAmount, refundingTokenAmount, _pid);
        } else {
            require(_userInfo[msg.sender][_pid].purchasedTokens > 0, "No tokens to harvest");

            uint256 claimableAmount = _claimableTokens(address(msg.sender), _pid);

            if (claimableAmount > 0) {
                _userInfo[msg.sender][_pid].claimedTokens = _userInfo[msg.sender][_pid].claimedTokens.add(claimableAmount);
                offeringToken.safeTransfer(address(msg.sender), claimableAmount);

                emit Harvest(msg.sender, claimableAmount, _pid);
            }
        }
    }

    /**
    * @notice Wrapper of _claimableTokens
    * @param _pid: pool id
    */
    function claimableTokens(uint8 _pid) external view returns (uint256) {
        return _claimableTokens(address(msg.sender), _pid);
    }

    /**
     * @notice It allows the admin to withdraw funds
     * @param _lpAmount: the number of LP token to withdraw (18 decimals)
     * @param _offerAmount: the number of offering amount to withdraw
     * @dev This function is only callable by admin.
     */
    function finalWithdraw(uint256 _lpAmount, uint256 _offerAmount) external onlyOwner {
        require(block.timestamp >= endTimestamp + 72 hours, "Can't withdraw now");
        require(_lpAmount <= lpToken.balanceOf(address(this)), "Not enough LP tokens");
        require(_offerAmount <= offeringToken.balanceOf(address(this)), "Not enough offering token");

        if (_lpAmount > 0) {
            lpToken.safeTransfer(address(msg.sender), _lpAmount);
        }

        if (_offerAmount > 0) {
            offeringToken.safeTransfer(address(msg.sender), _offerAmount);
        }

        emit AdminWithdraw(_lpAmount, _offerAmount);
    }

    /**
     * @notice It allows the admin to withdraw lp tokens raised from sale
     * @dev This function is only callable by admin.
     */
    function withdrawRaised() external onlyOwner {
        require(block.timestamp >= endTimestamp, "Can't withdraw now");
        require(raisedWithdrawn == false, "Already withdrawn");

        // Calculate raised lp tokens from all pools and send them to the admin
        uint256 _lpAmount;

        for (uint8 i = 0; i < _poolInformation.length; i++) {
            uint256 _lpAmountPool;
            if (_poolInformation[i].totalAmountPool > _poolInformation[i].raisingAmountPool) {
                _lpAmountPool = _poolInformation[i].raisingAmountPool;
            } else {
                _lpAmountPool = _poolInformation[i].totalAmountPool;
            }

            _lpAmount = _lpAmount.add(_lpAmountPool);
        }

        if (_lpAmount > 0) {
            lpToken.safeTransfer(address(msg.sender), _lpAmount);
        }

        raisedWithdrawn = true;

        emit AdminWithdraw(_lpAmount, 0);
    }

    /**
     * @notice It allows the admin to recover wrong tokens sent to the contract
     * @param _tokenAddress: the address of the token to withdraw (18 decimals)
     * @param _tokenAmount: the number of token amount to withdraw
     * @dev This function is only callable by admin.
     */
    function recoverWrongTokens(address _tokenAddress, uint256 _tokenAmount) external onlyOwner {
        require(_tokenAddress != address(lpToken), "Cannot be LP token");
        require(_tokenAddress != address(offeringToken), "Cannot be offering token");

        IERC20(_tokenAddress).safeTransfer(address(msg.sender), _tokenAmount);

        emit AdminTokenRecovery(_tokenAddress, _tokenAmount);
    }

    /**
     * @notice It sets parameters for pool
     * @param _offeringAmountPool: offering amount (in tokens)
     * @param _raisingAmountPool: raising amount (in LP tokens)
     * @param _limitPerUserInLP: limit per user (in LP tokens)
     * @param _hasTax: if the pool has a tax
     * @param _pid: pool id
     * @dev This function is only callable by admin.
     */
    function setPool(
        uint256 _offeringAmountPool,
        uint256 _raisingAmountPool,
        uint256 _limitPerUserInLP,
        bool _hasTax,
        uint8 _pid
    ) external onlyOwner {
        require(block.timestamp < startTimestamp, "IFO has started");
        require(_pid < numberPools, "Pool does not exist");

        _poolInformation[_pid].offeringAmountPool = _offeringAmountPool;
        _poolInformation[_pid].raisingAmountPool = _raisingAmountPool;
        _poolInformation[_pid].limitPerUserInLP = _limitPerUserInLP;
        _poolInformation[_pid].hasTax = _hasTax;

        emit PoolParametersSet(_offeringAmountPool, _raisingAmountPool, _pid);
    }

    /**
     * @notice It allows the admin to update start and end timestamps
     * @param _startTimestamp: the new start timestamp
     * @param _endTimestamp: the new end timestamp
     * @dev This function is only callable by admin.
     */
    function updateStartAndEndTimestamps(uint256 _startTimestamp, uint256 _endTimestamp) external onlyOwner {
        require(block.timestamp < startTimestamp, "IFO has started");
        require(_startTimestamp < _endTimestamp, "New startTimestamp must be lower than new endTimestamp");
        require(block.timestamp < _startTimestamp, "New startTimestamp must be higher than current timestamp");

        startTimestamp = _startTimestamp;
        endTimestamp = _endTimestamp;

        emit NewStartAndEndTimestamps(_startTimestamp, _endTimestamp);
    }

    /**
     * @notice Release more tokens to allow IFO participants claim more.
     * @param _releasedPercent: percent of the release
     * @param _nextReleaseTimestamp: time of the next release. If release percent is 100 this may be a dummy time in the future.
     * @dev This function is only callable by admin.
     */
    function releaseTokens(uint256 _releasedPercent, uint256 _nextReleaseTimestamp) external onlyOwner {
        require(block.timestamp > endTimestamp, "IFO must be ended");
        require(_releasedPercent > releasedPercent, "Release percent must be greater than its previous value");
        require(_releasedPercent <= 100, "Release percent must be lower or equal to 100");
        require(_nextReleaseTimestamp > nextReleaseTimestamp, "Next release timestamp must be greater than current value");

        releasedPercent = _releasedPercent;
        nextReleaseTimestamp = _nextReleaseTimestamp;

        emit TokensReleased(_releasedPercent, _nextReleaseTimestamp);
    }

    /**
     * @notice It returns the pool information
     * @param _pid: poolId
     * @return raisingAmountPool: amount of LP tokens raised (in LP tokens)
     * @return offeringAmountPool: amount of tokens offered for the pool (in offeringTokens)
     * @return limitPerUserInLP; // limit of tokens per user (if 0, it is ignored)
     * @return hasTax: tax on the overflow (if any, it works with _calculateTaxOverflow)
     * @return totalAmountPool: total amount pool deposited (in LP tokens)
     * @return sumTaxesOverflow: total taxes collected (starts at 0, increases with each harvest if overflow)
     */
    function viewPoolInformation(uint256 _pid)
    external
    view
    returns (
        uint256,
        uint256,
        uint256,
        bool,
        uint256,
        uint256
    )
    {
        return (
        _poolInformation[_pid].raisingAmountPool,
        _poolInformation[_pid].offeringAmountPool,
        _poolInformation[_pid].limitPerUserInLP,
        _poolInformation[_pid].hasTax,
        _poolInformation[_pid].totalAmountPool,
        _poolInformation[_pid].sumTaxesOverflow
        );
    }

    /**
     * @notice It returns the tax overflow rate calculated for a pool
     * @dev 100,000,000,000 means 0.1 (10%) / 1 means 0.0000000000001 (0.0000001%) / 1,000,000,000,000 means 1 (100%)
     * @param _pid: poolId
     * @return It returns the tax percentage
     */
    function viewPoolTaxRateOverflow(uint256 _pid) external view returns (uint256) {
        if (!_poolInformation[_pid].hasTax) {
            return 0;
        } else {
            return
            _calculateTaxOverflow(_poolInformation[_pid].totalAmountPool, _poolInformation[_pid].raisingAmountPool);
        }
    }

    /**
     * @notice External view function to see user allocations for both pools
     * @param _user: user address
     * @param _pids[]: array of pids
     * @return
     */
    function viewUserAllocationPools(address _user, uint8[] calldata _pids)
    external
    view
    returns (uint256[] memory)
    {
        uint256[] memory allocationPools = new uint256[](_pids.length);
        for (uint8 i = 0; i < _pids.length; i++) {
            allocationPools[i] = _getUserAllocationPool(_user, _pids[i]);
        }
        return allocationPools;
    }

    /**
     * @notice External view function to see user information
     * @param _user: user address
     * @param _pids[]: array of pids
     */
    function viewUserInfo(address _user, uint8[] calldata _pids)
    external
    view
    returns (uint256[] memory, bool[] memory, uint256[] memory, uint256[] memory)
    {
        uint256[] memory amountPools = new uint256[](_pids.length);
        bool[] memory statusPools = new bool[](_pids.length);
        uint256[] memory purchasedPools = new uint256[](_pids.length);
        uint256[] memory claimedPools = new uint256[](_pids.length);

        for (uint8 i = 0; i < numberPools; i++) {
            amountPools[i] = _userInfo[_user][i].amountPool;
            statusPools[i] = _userInfo[_user][i].claimedPool;
            purchasedPools[i] = _userInfo[_user][i].purchasedTokens;
            claimedPools[i] = _userInfo[_user][i].claimedTokens;
        }
        return (amountPools, statusPools, purchasedPools, claimedPools);
    }

    /**
     * @notice External view function to see user offering and refunding amounts for both pools
     * @param _user: user address
     * @param _pids: array of pids
     */
    function viewUserOfferingAndRefundingAmountsForPools(address _user, uint8[] calldata _pids)
    external
    view
    returns (uint256[3][] memory)
    {
        uint256[3][] memory amountPools = new uint256[3][](_pids.length);

        for (uint8 i = 0; i < _pids.length; i++) {
            uint256 userOfferingAmountPool;
            uint256 userRefundingAmountPool;
            uint256 userTaxAmountPool;

            if (_poolInformation[_pids[i]].raisingAmountPool > 0) {
                (
                userOfferingAmountPool,
                userRefundingAmountPool,
                userTaxAmountPool
                ) = _calculateOfferingAndRefundingAmountsPool(_user, _pids[i]);
            }

            amountPools[i] = [userOfferingAmountPool, userRefundingAmountPool, userTaxAmountPool];
        }
        return amountPools;
    }

    /**
     * @notice It calculates the tax overflow given the raisingAmountPool and the totalAmountPool.
     * @dev 100,000,000,000 means 0.1 (10%) / 1 means 0.0000000000001 (0.0000001%) / 1,000,000,000,000 means 1 (100%)
     * @return It returns the tax percentage
     */
    function _calculateTaxOverflow(uint256 _totalAmountPool, uint256 _raisingAmountPool)
    internal
    pure
    returns (uint256)
    {
        uint256 ratioOverflow = _totalAmountPool.div(_raisingAmountPool);

        if (ratioOverflow >= 500) {
            return 2000000000;
            // 0.2%
        } else if (ratioOverflow >= 250) {
            return 2500000000;
            // 0.25%
        } else if (ratioOverflow >= 100) {
            return 3000000000;
            // 0.3%
        } else if (ratioOverflow >= 50) {
            return 5000000000;
            // 0.5%
        } else {
            return 10000000000;
            // 1%
        }
    }

    /**
     * @notice It calculates the offering amount for a user and the number of LP tokens to transfer back.
     * @param _user: user address
     * @param _pid: pool id
     * @return {uint256, uint256, uint256} It returns the offering amount, the refunding amount (in LP tokens),
     * and the tax (if any, else 0)
     */
    function _calculateOfferingAndRefundingAmountsPool(address _user, uint8 _pid)
    internal
    view
    returns (
        uint256,
        uint256,
        uint256
    )
    {
        uint256 userOfferingAmount;
        uint256 userRefundingAmount;
        uint256 taxAmount;

        if (_poolInformation[_pid].totalAmountPool > _poolInformation[_pid].raisingAmountPool) {
            // Calculate allocation for the user
            uint256 allocation = _getUserAllocationPool(_user, _pid);

            // Calculate the offering amount for the user based on the offeringAmount for the pool
            userOfferingAmount = _poolInformation[_pid].offeringAmountPool.mul(allocation).div(1e12);

            // Calculate the payAmount
            uint256 payAmount = _poolInformation[_pid].raisingAmountPool.mul(allocation).div(1e12);

            // Calculate the pre-tax refunding amount
            userRefundingAmount = _userInfo[_user][_pid].amountPool.sub(payAmount);

            // Retrieve the tax rate
            if (_poolInformation[_pid].hasTax) {
                uint256 taxOverflow =
                _calculateTaxOverflow(
                    _poolInformation[_pid].totalAmountPool,
                    _poolInformation[_pid].raisingAmountPool
                );

                // Calculate the final taxAmount
                taxAmount = userRefundingAmount.mul(taxOverflow).div(1e12);

                // Adjust the refunding amount
                userRefundingAmount = userRefundingAmount.sub(taxAmount);
            }
        } else {
            userRefundingAmount = 0;
            taxAmount = 0;
            // _userInfo[_user] / (raisingAmount / offeringAmount)
            userOfferingAmount = _userInfo[_user][_pid].amountPool.mul(_poolInformation[_pid].offeringAmountPool).div(
                _poolInformation[_pid].raisingAmountPool
            );
        }
        return (userOfferingAmount, userRefundingAmount, taxAmount);
    }

    /**
     * @notice It returns the user allocation for pool
     * @dev 100,000,000,000 means 0.1 (10%) / 1 means 0.0000000000001 (0.0000001%) / 1,000,000,000,000 means 1 (100%)
     * @param _user: user address
     * @param _pid: pool id
     * @return it returns the user's share of pool
     */
    function _getUserAllocationPool(address _user, uint8 _pid) internal view returns (uint256) {
        if (_poolInformation[_pid].totalAmountPool > 0) {
            return _userInfo[_user][_pid].amountPool.mul(1e18).div(_poolInformation[_pid].totalAmountPool.mul(1e6));
        } else {
            return 0;
        }
    }

    /**
     * @notice Returns claimable offering token amount for an address by pool id
     * @param _address: address
     * @param _pid: pool id
     */
    function _claimableTokens(address _address, uint8 _pid) internal view returns (uint256) {
        UserInfo storage user = _userInfo[_address][_pid];

        if (!user.claimedPool) {
            // The user hasn't done first harvest yet.
            (uint256 offeringTokenAmount,,) = _calculateOfferingAndRefundingAmountsPool(
                _address,
                _pid
            );

            return offeringTokenAmount > 0 ? offeringTokenAmount.mul(releasedPercent).div(100) : 0;
        }

        uint256 purchased = user.purchasedTokens;
        uint256 claimed = user.claimedTokens;
        return purchased.mul(releasedPercent).div(100).sub(claimed);
    }

    /**
     * @notice Check if an address is a contract
     */
    function _isContract(address _addr) internal view returns (bool) {
        uint256 size;
        assembly {
            size := extcodesize(_addr)
        }
        return size > 0;
    }
}
