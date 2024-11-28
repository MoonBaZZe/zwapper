// SPDX-License-Identifier: MIT

pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

struct receiveInfo {
    address receiveAddress;
    uint listenHeight;
}

// This smart contract will map each receiving address to a chain id
// Users will send funds to those addresses and the payments will be done
// using this smart contract in order to emit an event and also store that
// the payment was sent
contract ZwapperE is Ownable {
    using SafeERC20 for IERC20;

    uint256 private constant uint256max = type(uint256).max;

    // paid[hash][logIndex] is the originating network chainId if a transfer has already occurred, otherwise is 0
    mapping(uint256 => mapping(uint256 => uint256)) public paid;
    // each chain has a different receive address
    mapping(uint256 => receiveInfo) public allowedChainIdMap;
    uint[] public allowedChainIdArray;
    mapping(address => uint256) public receiveAddressToChainId;

    event Paid(uint256 hash, uint256 logIndex, uint256 sourceChainId);

    fallback() external payable {
        (bool sent,) = payable(owner()).call{value: msg.value}("");
        require(sent, "Failed to send Ether");
    }

    function setChainId(uint256 _chainId, address _receiveAddress, uint _listenHeight) external onlyOwner {
        // The entry does not exist
        if (allowedChainIdMap[_chainId].receiveAddress == address(0x0)) {
            allowedChainIdArray.push(_chainId);
        } else if (_receiveAddress == address(0x0)) {
            // Delete an entry
            uint foundIndex = uint256max;
            for (uint i = 0; i < allowedChainIdArray.length; i++) {
                if (allowedChainIdArray[i] == _chainId) {
                    foundIndex = i;
                    break;
                }
            }
            if (foundIndex != uint256max) {
                for (uint i = foundIndex; i < allowedChainIdArray.length - 1; i++) {
                    allowedChainIdArray[i] = allowedChainIdArray[i + 1];
                }
                // Also works if foundIndex is allowedChainIdArray.length - 1
                allowedChainIdArray.pop();
            }
        }
        // delete old entry
        receiveAddressToChainId[allowedChainIdMap[_chainId].receiveAddress] = 0;

        allowedChainIdMap[_chainId].receiveAddress = _receiveAddress;
        allowedChainIdMap[_chainId].listenHeight = _listenHeight;
        receiveAddressToChainId[_receiveAddress] = _chainId;
    }

    function payERC20(address _token, address payable _to, uint256 _amount, uint256 _hash, uint256 _logIndex, uint256 _sourceChainId) external onlyOwner {
        require(paid[_hash][_logIndex] == 0, "Transaction hash and log index were already paid");
        require(allowedChainIdMap[_sourceChainId].receiveAddress != address(0x0), "Chain id is not allowed");
        paid[_hash][_logIndex] = _sourceChainId;

        // Just iterate and see which address has funds
        for (uint i = 0; i < allowedChainIdArray.length; i++) {
            address receivingAddress = allowedChainIdMap[_sourceChainId].receiveAddress;
            uint tokenBalance = IERC20(_token).balanceOf(receivingAddress);
            if (tokenBalance >= _amount) {
                IERC20(_token).safeTransferFrom(receivingAddress, _to, _amount);
                emit Paid(_hash, _logIndex, _sourceChainId);
                return;
            }
        }
        // If there was no payment, revert so the backend knows a re-balance is needed
        revert("Not enough funds");
    }
}