pragma solidity ^0.6.12;

import "@openzeppelin/contracts/presets/ERC20PresetMinterPauser.sol";

contract Token is ERC20PresetMinterPauser {
    constructor () public ERC20PresetMinterPauser("Foo Test Token2", "FTT2") {

    }
}
