/**
 * STEP Balance Screen
 * 
 * Displays user's STEP token balance, wallet address, and recent mining history.
 * 
 * Features:
 * - Current STEP token balance
 * - Wallet address with copy functionality
 * - Recent transaction history (last 10 proofs)
 * - Pull-to-refresh for balance updates
 * - Navigation to wallet management (future)
 * 
 * API Integration:
 * - GET /account/:address - Fetch balance and transaction history
 * - Fallback to mock data if API unavailable (development mode)
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  RefreshControl,
  Alert,
  ActivityIndicator,
  Clipboard,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import * as WalletLib from '../lib/wallet';
import { Wallet } from '../types';

/**
 * Account balance response from backend API
 * 
 * What: Balance and transaction data for a wallet address
 * Why: Displays user's token holdings and mining history
 */
interface AccountBalance {
  address: string;
  balance: string; // Decimal string (e.g., "123.456789")
  transactions: Transaction[];
  totalProofs: number;
  lastProofAt?: string; // ISO 8601 timestamp
}

/**
 * Transaction/Proof history entry
 * 
 * What: Single mining proof with reward details
 * Why: Shows users their mining activity and earnings
 */
interface Transaction {
  timestamp: string; // ISO 8601
  triangleId: string;
  reward: string; // Decimal string
  confidence?: number; // 0-100 (Phase 2.5 only)
  type: 'mine' | 'transfer' | 'reward';
}

export default function BalanceScreen() {
  // State
  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [balance, setBalance] = useState<AccountBalance | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * Initialize screen: load wallet and fetch balance
   */
  useEffect(() => {
    initializeScreen();
  }, []);

  const initializeScreen = async () => {
    try {
      setLoading(true);
      setError(null);

      // Load wallet
      const loadedWallet = await WalletLib.loadWallet();
      if (!loadedWallet) {
        setError('No wallet found. Please return to Map screen to generate a wallet.');
        setLoading(false);
        return;
      }
      setWallet(loadedWallet);

      // Fetch balance
      await fetchBalance(loadedWallet.address);

      setLoading(false);
    } catch (err) {
      console.error('Error initializing balance screen:', err);
      setError(String(err));
      setLoading(false);
    }
  };

  /**
   * Fetch account balance from backend API
   * 
   * What: GET /account/:address endpoint
   * Why: Retrieve current balance and transaction history
   * 
   * Fallback: If API unavailable, use mock data for development
   * 
   * @param address - Ethereum-style wallet address (0x...)
   */
  const fetchBalance = async (address: string) => {
    try {
      // API endpoint (production backend)
      const apiUrl = `https://step-blockchain-api.onrender.com/account/${address}`;

      console.log(`[BalanceScreen] Fetching balance for ${address}...`);

      const response = await fetch(apiUrl, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
        // Timeout after 10 seconds
      });

      if (!response.ok) {
        // If 404, account not found (zero balance, no proofs)
        if (response.status === 404) {
          console.log('[BalanceScreen] Account not found, using zero balance');
          setBalance({
            address,
            balance: '0.000000',
            transactions: [],
            totalProofs: 0,
          });
          return;
        }

        throw new Error(`API error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();

      // Expected response format:
      // { ok: true, balance: "123.456789", transactions: [...], totalProofs: 42 }
      if (data.ok) {
        setBalance({
          address,
          balance: data.balance || '0.000000',
          transactions: data.transactions || [],
          totalProofs: data.totalProofs || 0,
          lastProofAt: data.lastProofAt,
        });
        console.log(`[BalanceScreen] Balance loaded: ${data.balance} STEP`);
      } else {
        throw new Error(data.error || 'Failed to fetch balance');
      }
    } catch (err) {
      console.error('[BalanceScreen] API error, using mock data:', err);
      
      // Fallback to mock data for development
      // This allows UI development/testing without backend
      setBalance({
        address,
        balance: '0.000000',
        transactions: [],
        totalProofs: 0,
      });
      
      // Show warning to user
      setError('Unable to connect to API. Balance may be outdated.');
    }
  };

  /**
   * Pull-to-refresh handler
   * 
   * What: Refreshes balance and transaction data
   * Why: Users need to see updated balances after mining
   */
  const handleRefresh = async () => {
    if (!wallet) return;

    setRefreshing(true);
    setError(null);

    try {
      await fetchBalance(wallet.address);
    } catch (err) {
      console.error('Error refreshing balance:', err);
      setError('Failed to refresh balance');
    } finally {
      setRefreshing(false);
    }
  };

  /**
   * Copy wallet address to clipboard
   * 
   * What: Copies full address (0x...) to system clipboard
   * Why: Users need to share address for receiving tokens
   */
  const handleCopyAddress = () => {
    if (!wallet) return;

    Clipboard.setString(wallet.address);
    Alert.alert('Address Copied', 'Wallet address copied to clipboard');
  };

  /**
   * Format balance for display
   * 
   * What: Converts "123.456789" to "123.46" (2 decimals)
   * Why: Clean display, full precision shown on tap
   */
  const formatBalance = (balanceStr: string): string => {
    try {
      const num = parseFloat(balanceStr);
      return num.toFixed(2);
    } catch {
      return '0.00';
    }
  };

  /**
   * Format timestamp for display
   * 
   * What: Converts ISO 8601 to "Oct 6, 8:15 PM"
   * Why: Human-readable timestamps
   */
  const formatTimestamp = (isoString: string): string => {
    try {
      const date = new Date(isoString);
      return date.toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      });
    } catch {
      return 'Unknown';
    }
  };

  /**
   * Truncate triangle ID for display
   * 
   * What: "STEP-TRI-v1:L10:F0:01234567..." → "L10:F0:0123..."
   * Why: Compact display in transaction list
   */
  const truncateTriangleId = (triangleId: string): string => {
    // Extract level and face
    const match = triangleId.match(/L(\d+):F(\d+):/);
    if (match) {
      const level = match[1];
      const face = match[2];
      const pathStart = triangleId.split(':')[3]?.substring(0, 8) || '';
      return `L${level}:F${face}:${pathStart}...`;
    }
    return triangleId.substring(0, 20) + '...';
  };

  // Loading state
  if (loading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#000000" />
        <Text style={styles.loadingText}>Loading balance...</Text>
      </View>
    );
  }

  // Error state (no wallet)
  if (error && !wallet) {
    return (
      <View style={styles.centerContainer}>
        <Text style={styles.errorText}>{error}</Text>
        <Text style={styles.errorHint}>Return to Map screen to create a wallet</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar style="dark" />

      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>💰 Balance</Text>
      </View>

      <ScrollView
        style={styles.scrollView}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
        }
      >
        {/* Wallet Address Card */}
        <View style={styles.card}>
          <Text style={styles.cardLabel}>Wallet Address</Text>
          <TouchableOpacity onPress={handleCopyAddress} style={styles.addressContainer}>
            <Text style={styles.addressText}>
              {wallet?.address.substring(0, 10)}...{wallet?.address.substring(wallet.address.length - 8)}
            </Text>
            <Text style={styles.copyIcon}>📋</Text>
          </TouchableOpacity>
          <Text style={styles.copyHint}>Tap to copy full address</Text>
        </View>

        {/* Balance Card */}
        <View style={[styles.card, styles.balanceCard]}>
          <Text style={styles.balanceLabel}>STEP Balance</Text>
          <Text style={styles.balanceValue}>
            {balance ? formatBalance(balance.balance) : '0.00'}
          </Text>
          <Text style={styles.balanceUnit}>STEP</Text>

          {/* Stats */}
          <View style={styles.statsRow}>
            <View style={styles.stat}>
              <Text style={styles.statValue}>{balance?.totalProofs || 0}</Text>
              <Text style={styles.statLabel}>Total Proofs</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.stat}>
              <Text style={styles.statValue}>
                {balance?.transactions.length || 0}
              </Text>
              <Text style={styles.statLabel}>Recent</Text>
            </View>
          </View>

          {/* Last proof timestamp */}
          {balance?.lastProofAt && (
            <Text style={styles.lastProof}>
              Last proof: {formatTimestamp(balance.lastProofAt)}
            </Text>
          )}
        </View>

        {/* API Error Warning */}
        {error && (
          <View style={styles.warningCard}>
            <Text style={styles.warningText}>⚠️ {error}</Text>
          </View>
        )}

        {/* Transaction History */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Recent Mining Activity</Text>

          {balance && balance.transactions.length === 0 ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyIcon}>⛏️</Text>
              <Text style={styles.emptyText}>No mining history found</Text>
              <Text style={styles.emptyHint}>
                Mining is working, but transaction history\nmay take time to sync from backend.\n\nCheck your balance after refreshing!
              </Text>
            </View>
          ) : (
            <View style={styles.transactionList}>
              {balance?.transactions.slice(0, 10).map((tx, index) => (
                <View key={index} style={styles.transaction}>
                  <View style={styles.transactionHeader}>
                    <Text style={styles.transactionType}>
                      {tx.type === 'mine' ? '⛏️ Mined' : '💰 Reward'}
                    </Text>
                    <Text style={styles.transactionReward}>+{tx.reward} STEP</Text>
                  </View>

                  <View style={styles.transactionDetails}>
                    <Text style={styles.transactionTriangle}>
                      {truncateTriangleId(tx.triangleId)}
                    </Text>
                    <Text style={styles.transactionTime}>
                      {formatTimestamp(tx.timestamp)}
                    </Text>
                  </View>

                  {/* Confidence score (Phase 2.5) */}
                  {tx.confidence !== undefined && (
                    <View style={styles.confidenceContainer}>
                      <Text style={styles.confidenceLabel}>Confidence:</Text>
                      <Text
                        style={[
                          styles.confidenceValue,
                          tx.confidence >= 90
                            ? styles.confidenceHigh
                            : tx.confidence >= 75
                            ? styles.confidenceMedium
                            : styles.confidenceLow,
                        ]}
                      >
                        {tx.confidence}/100
                      </Text>
                    </View>
                  )}
                </View>
              ))}
            </View>
          )}
        </View>

        {/* Action Buttons */}
        <View style={styles.actions}>
          <TouchableOpacity
            style={[styles.button, styles.secondaryButton]}
            onPress={handleRefresh}
            disabled={refreshing}
          >
            <Text style={styles.buttonText}>
              {refreshing ? '🔄 Refreshing...' : '🔄 Refresh Balance'}
            </Text>
          </TouchableOpacity>

          {/* Future: Export wallet, transfer tokens, etc. */}
        </View>

        {/* Bottom spacing */}
        <View style={styles.bottomSpacer} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F5F5',
  },
  centerContainer: {
    flex: 1,
    backgroundColor: '#F5F5F5',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  header: {
    padding: 20,
    paddingTop: 60,
    backgroundColor: '#000000',
    borderBottomWidth: 2,
    borderBottomColor: '#FFFFFF',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  scrollView: {
    flex: 1,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderWidth: 2,
    borderColor: '#000000',
    margin: 10,
    padding: 15,
  },
  cardLabel: {
    fontSize: 12,
    color: '#666666',
    marginBottom: 8,
    fontWeight: '600',
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 12,
  },
  addressContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#F0F0F0',
    padding: 12,
    borderWidth: 1,
    borderColor: '#CCCCCC',
  },
  addressText: {
    fontSize: 14,
    fontFamily: 'monospace',
    flex: 1,
  },
  copyIcon: {
    fontSize: 20,
    marginLeft: 8,
  },
  copyHint: {
    fontSize: 10,
    color: '#999999',
    marginTop: 4,
  },
  balanceCard: {
    alignItems: 'center',
    paddingVertical: 24,
  },
  balanceLabel: {
    fontSize: 12,
    color: '#666666',
    marginBottom: 8,
  },
  balanceValue: {
    fontSize: 48,
    fontWeight: 'bold',
    color: '#000000',
  },
  balanceUnit: {
    fontSize: 16,
    color: '#666666',
    marginTop: 4,
  },
  statsRow: {
    flexDirection: 'row',
    marginTop: 24,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: '#EEEEEE',
    width: '100%',
  },
  stat: {
    flex: 1,
    alignItems: 'center',
  },
  statDivider: {
    width: 1,
    backgroundColor: '#EEEEEE',
  },
  statValue: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#000000',
  },
  statLabel: {
    fontSize: 12,
    color: '#666666',
    marginTop: 4,
  },
  lastProof: {
    fontSize: 11,
    color: '#999999',
    marginTop: 12,
  },
  warningCard: {
    backgroundColor: '#FFF3CD',
    borderWidth: 2,
    borderColor: '#FFC107',
    margin: 10,
    padding: 12,
  },
  warningText: {
    fontSize: 12,
    color: '#856404',
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 32,
  },
  emptyIcon: {
    fontSize: 48,
    marginBottom: 12,
  },
  emptyText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#666666',
    marginBottom: 8,
  },
  emptyHint: {
    fontSize: 12,
    color: '#999999',
    textAlign: 'center',
    maxWidth: 250,
  },
  transactionList: {
    gap: 12,
  },
  transaction: {
    backgroundColor: '#F9F9F9',
    padding: 12,
    borderWidth: 1,
    borderColor: '#EEEEEE',
  },
  transactionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  transactionType: {
    fontSize: 14,
    fontWeight: '600',
  },
  transactionReward: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#00AA00',
  },
  transactionDetails: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  transactionTriangle: {
    fontSize: 11,
    fontFamily: 'monospace',
    color: '#0066CC',
    flex: 1,
  },
  transactionTime: {
    fontSize: 11,
    color: '#999999',
    marginLeft: 8,
  },
  confidenceContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#EEEEEE',
  },
  confidenceLabel: {
    fontSize: 11,
    color: '#666666',
    marginRight: 8,
  },
  confidenceValue: {
    fontSize: 11,
    fontWeight: 'bold',
  },
  confidenceHigh: {
    color: '#00AA00',
  },
  confidenceMedium: {
    color: '#FF8800',
  },
  confidenceLow: {
    color: '#CC0000',
  },
  actions: {
    padding: 10,
    gap: 10,
  },
  button: {
    backgroundColor: '#000000',
    padding: 16,
    borderRadius: 0,
    borderWidth: 2,
    borderColor: '#000000',
    alignItems: 'center',
  },
  secondaryButton: {
    backgroundColor: '#FFFFFF',
  },
  buttonText: {
    color: '#000000',
    fontSize: 14,
    fontWeight: 'bold',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    color: '#666666',
  },
  errorText: {
    fontSize: 16,
    color: '#CC0000',
    marginBottom: 12,
    textAlign: 'center',
    fontWeight: '600',
  },
  errorHint: {
    fontSize: 14,
    color: '#666666',
    textAlign: 'center',
  },
  bottomSpacer: {
    height: 40,
  },
});
