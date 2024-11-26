// SPDX-License-Identifier: MIT

pragma solidity ^0.8.24;

interface IZwapper {
    function receiveForSupernova(uint256) external payable;
}

contract ZwapperProxy {
    uint256 public chainId;
    IZwapper public zwapper;

    constructor(address _zwapper, uint256 _chainId) {
        zwapper = IZwapper(_zwapper);
        chainId = _chainId;
    }

    receive() external payable {
        zwapper.receiveForSupernova{value: msg.value}(chainId);
    }
}