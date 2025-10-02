// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

/**
 * @title BlockmassAnchor
 * @notice Minimal contract for anchoring proof-of-location event hashes on Sepolia testnet
 * @dev Stores contentHash (SHA-256 from off-chain canonical event) with block timestamp
 */
contract BlockmassAnchor {
    // Maps contentHash => timestamp of first anchor
    mapping(bytes32 => uint256) public anchors;

    // Emitted when a new hash is anchored
    event Anchored(bytes32 indexed contentHash, uint256 timestamp, address indexed operator);

    /**
     * @notice Anchor a contentHash on-chain
     * @param contentHash The SHA-256 hash of the canonical event (computed off-chain)
     * @dev Only anchors if not already stored; idempotent for same hash
     */
    function anchor(bytes32 contentHash) external {
        require(contentHash != bytes32(0), "Invalid hash");
        
        // If already anchored, revert to save gas
        require(anchors[contentHash] == 0, "Already anchored");
        
        // Store timestamp
        anchors[contentHash] = block.timestamp;
        
        // Emit event for indexing
        emit Anchored(contentHash, block.timestamp, msg.sender);
    }

    /**
     * @notice Check if a hash has been anchored and retrieve its timestamp
     * @param contentHash The hash to check
     * @return timestamp The block timestamp when anchored (0 if not anchored)
     */
    function getAnchor(bytes32 contentHash) external view returns (uint256) {
        return anchors[contentHash];
    }

    /**
     * @notice Batch anchor multiple hashes (gas-optimized for operators)
     * @param contentHashes Array of hashes to anchor
     * @dev Skips already-anchored hashes silently
     */
    function anchorBatch(bytes32[] calldata contentHashes) external {
        for (uint256 i = 0; i < contentHashes.length; i++) {
            bytes32 hash = contentHashes[i];
            
            // Skip invalid or already-anchored hashes
            if (hash == bytes32(0) || anchors[hash] != 0) {
                continue;
            }
            
            anchors[hash] = block.timestamp;
            emit Anchored(hash, block.timestamp, msg.sender);
        }
    }
}
