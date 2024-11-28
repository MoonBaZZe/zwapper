// SPDX-License-Identifier: MIT

pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";


contract ZwapperS is Ownable {
    using SafeERC20 for IERC20;
    uint256 public minAmount;

    // paid[hash][logIndex] is the originating network chainId if a transfer has already occurred, otherwise is 0
    mapping(uint256 => mapping(uint256 => uint256)) public paid;
    mapping(uint256 => bool) public allowedChainId;

    event Receive(address indexed from, uint256 value, uint256 destinationChainId);
    event Paid(uint256 hash, uint256 logIndex, uint256 sourceChainId);

    constructor(uint256 _minAmount) {
        minAmount = _minAmount;
    }

    receive() external payable {}

    function setChainId(uint256 _chainId, bool _value) external onlyOwner {
        allowedChainId[_chainId] = _value;
    }

    function setMinAmount(uint256 _minAmount) external onlyOwner {
        minAmount = _minAmount;
    }

    function receiveS(uint256 _destinationChainId) external payable {
        require(allowedChainId[_destinationChainId] == true, "ChainId not allowed");
        require(msg.value > minAmount, "Value should be greater than minAmount");
        // Use tx.origin as it is the initial sender
        // Reduce the number of decimals
        emit Receive(tx.origin, msg.value / 1e10, _destinationChainId);
    }

    function pay(address payable _to, uint256 _amount, uint256 _hash, uint256 _logIndex, uint256 _sourceChainId) external onlyOwner {
        require(paid[_hash][_logIndex] == 0, "Transaction hash and log index were already paid");
        require(_sourceChainId != 0, "Source chain id can not be 0");
        paid[_hash][_logIndex] = _sourceChainId;

        (bool success, ) = _to.call{value: _amount}("");
        require(success, "Could not send the funds");

        emit Paid(_hash, _logIndex, _sourceChainId);
    }

    function payERC20(address _token, address payable _to, uint256 _amount, uint256 _hash, uint256 _logIndex, uint256 _sourceChainId) external onlyOwner {
        require(paid[_hash][_logIndex] == 0, "Transaction hash and log index were already paid");
        require(_sourceChainId != 0, "Source chain id can not be 0");
        paid[_hash][_logIndex] = _sourceChainId;

        IERC20(_token).safeTransferFrom(address(this), _to, _amount);

        emit Paid(_hash, _logIndex, _sourceChainId);
    }
}