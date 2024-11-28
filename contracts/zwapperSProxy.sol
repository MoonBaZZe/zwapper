// SPDX-License-Identifier: MIT

pragma solidity ^0.8.24;

interface IZwapperS {
    function receiveS(uint256) external payable;
}

// Each destination network will be an instance of this smart contract
// A user that wants to zwap to Ethereum will send XZNN to the proxy smart contract
// that has the chainId of Ethereum and it will forward them to the zwapperS contract
// which will emit the proper event
contract ZwapperSProxy {
    uint256 public chainId;
    IZwapperS public zwapperS;

    constructor(address _zwapperS, uint256 _chainId) {
        zwapperS = IZwapperS(_zwapperS);
        chainId = _chainId;
    }

    receive() external payable {
        zwapperS.receiveS{value: msg.value}(chainId);
    }
}