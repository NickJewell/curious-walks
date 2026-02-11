import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  Modal,
  ScrollView,
  Pressable,
  StyleSheet,
  Dimensions,
  Platform,
  TextInput,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { Feather } from '@expo/vector-icons';
import Animated, {
  FadeIn,
  FadeOut,
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withSequence,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { Colors, Spacing, BorderRadius, Typography } from '@/constants/theme';
import { getApiUrl, apiRequest } from '@/lib/query-client';
import { useAuth } from '@/contexts/AuthContext';
import type { Curio } from '@/lib/supabase';

function getAudioUrl(path: string): string {
  if (path.startsWith('http://') || path.startsWith('https://')) {
    return path;
  }
  const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL || '';
  return `${supabaseUrl}/storage/v1/object/public/${path}`;
}

function formatTime(seconds: number): string {
  if (!isFinite(seconds) || seconds < 0) return '0:00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

interface Fact {
  id: string;
  curio_id: string;
  fact_info: string;
}

interface PlaceDetailModalProps {
  visible: boolean;
  place: Curio | null;
  onClose: () => void;
}

const REPORT_REASONS = ['Inaccurate', 'Typo', 'Offensive', 'Other'] as const;
type ReportReason = typeof REPORT_REASONS[number];

export default function PlaceDetailModal({ visible, place, onClose }: PlaceDetailModalProps) {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  
  const [facts, setFacts] = useState<Fact[]>([]);
  const [viewedFactIds, setViewedFactIds] = useState<Set<string>>(new Set());
  const [currentFact, setCurrentFact] = useState<Fact | null>(null);
  const [showFact, setShowFact] = useState(false);
  const [loadingFacts, setLoadingFacts] = useState(false);
  
  const [showReportModal, setShowReportModal] = useState(false);
  const [reportReason, setReportReason] = useState<ReportReason>('Inaccurate');
  const [reportComment, setReportComment] = useState('');
  const [submittingReport, setSubmittingReport] = useState(false);
  
  const [hasVotedUp, setHasVotedUp] = useState(false);
  const [hasVotedDown, setHasVotedDown] = useState(false);
  
  const audioSource = place?.detailAudioPath ? getAudioUrl(place.detailAudioPath) : null;
  const hasAudio = !!place?.detailAudioPath;
  const player = useAudioPlayer(audioSource, { updateInterval: 500 });
  const status = useAudioPlayerStatus(player);

  const handlePlayPause = useCallback(() => {
    if (!hasAudio) return;
    if (status.playing) {
      player.pause();
    } else {
      player.play();
    }
  }, [hasAudio, status.playing, player]);

  const handleSeek = useCallback((locationX: number, layoutWidth: number) => {
    if (!hasAudio || !status.duration || status.duration <= 0) return;
    const ratio = Math.max(0, Math.min(1, locationX / layoutWidth));
    player.seekTo(ratio * status.duration);
  }, [hasAudio, status.duration, player]);

  useEffect(() => {
    if (!visible && player) {
      player.pause();
      player.seekTo(0);
    }
  }, [visible, player]);

  const thumbsUpScale = useSharedValue(1);
  const thumbsDownScale = useSharedValue(1);

  const thumbsUpStyle = useAnimatedStyle(() => ({
    transform: [{ scale: thumbsUpScale.value }],
  }));

  const thumbsDownStyle = useAnimatedStyle(() => ({
    transform: [{ scale: thumbsDownScale.value }],
  }));

  const fetchFacts = useCallback(async () => {
    if (!place) return;
    setLoadingFacts(true);
    try {
      const url = new URL(`/api/places/${encodeURIComponent(place.id)}/facts`, getApiUrl());
      const response = await fetch(url.toString());
      const data = await response.json();
      setFacts(data.facts || []);
    } catch (error) {
      console.error('Error fetching facts:', error);
    } finally {
      setLoadingFacts(false);
    }
  }, [place]);

  useEffect(() => {
    if (visible && place) {
      fetchFacts();
      setViewedFactIds(new Set());
      setCurrentFact(null);
      setShowFact(false);
      setHasVotedUp(false);
      setHasVotedDown(false);
    }
  }, [visible, place, fetchFacts]);

  const handleShowRandomFact = () => {
    const unviewedFacts = facts.filter(f => !viewedFactIds.has(f.id));
    if (unviewedFacts.length === 0) {
      if (facts.length > 0) {
        setViewedFactIds(new Set());
        const randomFact = facts[Math.floor(Math.random() * facts.length)];
        setCurrentFact(randomFact);
        setViewedFactIds(new Set([randomFact.id]));
      }
      return;
    }
    
    const randomFact = unviewedFacts[Math.floor(Math.random() * unviewedFacts.length)];
    setCurrentFact(randomFact);
    setViewedFactIds(prev => new Set([...prev, randomFact.id]));
    setShowFact(true);
  };

  const handleVoteUp = async () => {
    if (!place) return;
    
    thumbsUpScale.value = withSequence(
      withSpring(1.3, { damping: 10 }),
      withSpring(1, { damping: 10 })
    );
    
    if (hasVotedUp) {
      // Remove the vote
      setHasVotedUp(false);
      try {
        await apiRequest('DELETE', '/api/content/vote', {
          curioId: place.id,
          voteType: 'up',
          userId: user?.id || null,
        });
      } catch (error) {
        console.error('Error removing vote:', error);
        setHasVotedUp(true); // Revert on error
      }
    } else {
      // Add the vote (and remove down vote if exists)
      setHasVotedUp(true);
      if (hasVotedDown) {
        setHasVotedDown(false);
      }
      try {
        // Remove any existing down vote first
        if (hasVotedDown) {
          await apiRequest('DELETE', '/api/content/vote', {
            curioId: place.id,
            voteType: 'down',
            userId: user?.id || null,
          });
        }
        await apiRequest('POST', '/api/content/vote', {
          curioId: place.id,
          voteType: 'up',
          userId: user?.id || null,
        });
      } catch (error) {
        console.error('Error submitting vote:', error);
      }
    }
  };

  const handleVoteDown = () => {
    if (!place) return;
    
    thumbsDownScale.value = withSequence(
      withSpring(1.3, { damping: 10 }),
      withSpring(1, { damping: 10 })
    );
    
    if (hasVotedDown) {
      // Remove the down vote
      handleRemoveDownVote();
    } else {
      // Show report modal to add down vote
      setShowReportModal(true);
    }
  };

  const handleRemoveDownVote = async () => {
    if (!place) return;
    
    setHasVotedDown(false);
    try {
      await apiRequest('DELETE', '/api/content/vote', {
        curioId: place.id,
        voteType: 'down',
        userId: user?.id || null,
      });
    } catch (error) {
      console.error('Error removing vote:', error);
      setHasVotedDown(true); // Revert on error
    }
  };

  const handleSubmitReport = async () => {
    if (!place) return;
    
    setSubmittingReport(true);
    try {
      // Submit report
      await apiRequest('POST', '/api/content/report', {
        curioId: place.id,
        reason: reportReason,
        comment: reportComment,
        userId: user?.id || null,
      });
      
      // Remove any existing up vote first
      if (hasVotedUp) {
        await apiRequest('DELETE', '/api/content/vote', {
          curioId: place.id,
          voteType: 'up',
          userId: user?.id || null,
        });
        setHasVotedUp(false);
      }
      
      // Submit a down vote
      await apiRequest('POST', '/api/content/vote', {
        curioId: place.id,
        voteType: 'down',
        userId: user?.id || null,
      });
      
      setHasVotedDown(true);
      setShowReportModal(false);
      setReportComment('');
      Alert.alert('Thank you', "We'll look into it.");
    } catch (error) {
      console.error('Error submitting report:', error);
      Alert.alert('Error', 'Could not submit report. Please try again.');
    } finally {
      setSubmittingReport(false);
    }
  };

  if (!place) return null;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle={Platform.OS === 'ios' ? 'pageSheet' : 'fullScreen'}
      onRequestClose={onClose}
    >
      <View style={[styles.container, { backgroundColor: Colors.dark.backgroundRoot }]}>
        <View style={[styles.heroSection, { paddingTop: Platform.OS === 'ios' ? 0 : insets.top }]}>
          <View style={styles.heroPlaceholder}>
            <Feather name="map-pin" size={48} color={Colors.dark.accent} />
          </View>
          
          <Pressable
            style={({ pressed }) => [
              styles.closeButton,
              { top: Platform.OS === 'ios' ? Spacing.lg : insets.top + Spacing.sm },
              pressed && styles.closeButtonPressed,
            ]}
            onPress={onClose}
          >
            <BlurView intensity={60} tint="dark" style={StyleSheet.absoluteFill} />
            <Feather name="x" size={20} color={Colors.dark.text} />
          </Pressable>
        </View>

        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={[
            styles.scrollContent,
            { paddingBottom: insets.bottom + Spacing['3xl'] },
          ]}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.titleRow}>
            <Text style={styles.title}>{place.name}</Text>
            
            <View style={styles.voteButtons}>
              <Pressable onPress={handleVoteUp}>
                <Animated.View style={[styles.voteButton, thumbsUpStyle]}>
                  <Feather
                    name="thumbs-up"
                    size={20}
                    color={hasVotedUp ? '#4CAF50' : Colors.dark.textSecondary}
                  />
                </Animated.View>
              </Pressable>
              
              <Pressable onPress={handleVoteDown}>
                <Animated.View style={[styles.voteButton, thumbsDownStyle]}>
                  <Feather
                    name="thumbs-down"
                    size={20}
                    color={hasVotedDown ? '#F44336' : Colors.dark.textSecondary}
                  />
                </Animated.View>
              </Pressable>
            </View>
          </View>

          <View style={[styles.audioPlayerContainer, !hasAudio && styles.audioPlayerDisabled]}>
            <BlurView intensity={40} tint="dark" style={StyleSheet.absoluteFill} />
            <Pressable
              onPress={handlePlayPause}
              disabled={!hasAudio}
              style={({ pressed }) => [
                styles.audioPlayButton,
                pressed && hasAudio && styles.audioPlayButtonPressed,
              ]}
            >
              {hasAudio && !status.isLoaded ? (
                <ActivityIndicator size="small" color={Colors.dark.accent} />
              ) : (
                <Feather
                  name={status.playing ? 'pause-circle' : 'play-circle'}
                  size={32}
                  color={hasAudio ? Colors.dark.accent : Colors.dark.inactive}
                />
              )}
            </Pressable>
            <View style={styles.audioDetails}>
              <Pressable
                style={styles.audioProgressTouchable}
                disabled={!hasAudio}
                onPress={(e) => {
                  const { locationX } = e.nativeEvent;
                  handleSeek(locationX, SCREEN_WIDTH - Spacing.xl * 2 - Spacing.lg * 2 - 44 - Spacing.md);
                }}
              >
                <View style={styles.audioProgressTrack}>
                  <View
                    style={[
                      styles.audioProgressFill,
                      {
                        width: hasAudio && status.duration > 0
                          ? `${Math.min(100, (status.currentTime / status.duration) * 100)}%`
                          : '0%',
                        backgroundColor: hasAudio ? Colors.dark.accent : Colors.dark.inactive,
                      },
                    ]}
                  />
                </View>
              </Pressable>
              <View style={styles.audioTimeRow}>
                {hasAudio ? (
                  <>
                    <Text style={styles.audioTimeText}>
                      {formatTime(status.currentTime)}
                    </Text>
                    <Text style={styles.audioTimeText}>
                      {status.duration > 0 ? formatTime(status.duration) : '--:--'}
                    </Text>
                  </>
                ) : (
                  <Text style={styles.audioUnavailableText}>Audio not yet available</Text>
                )}
              </View>
            </View>
          </View>

          <Text style={styles.narrative}>
            {place.description || 'No description available for this location.'}
          </Text>

          {facts.length > 0 || !loadingFacts ? (
            <Pressable
              style={({ pressed }) => [
                styles.factCard,
                pressed && styles.factCardPressed,
              ]}
              onPress={handleShowRandomFact}
              disabled={facts.length === 0}
            >
              <BlurView intensity={30} tint="dark" style={StyleSheet.absoluteFill} />
              
              {showFact && currentFact ? (
                <Animated.View entering={FadeIn} style={styles.factContent}>
                  <View style={styles.factHeader}>
                    <Feather name="zap" size={18} color={Colors.dark.accent} />
                    <Text style={styles.factLabel}>Did you know?</Text>
                    
                    <View style={styles.factVoteButtons}>
                      <Pressable style={styles.factVoteBtn}>
                        <Feather name="thumbs-up" size={14} color={Colors.dark.textSecondary} />
                      </Pressable>
                      <Pressable style={styles.factVoteBtn}>
                        <Feather name="thumbs-down" size={14} color={Colors.dark.textSecondary} />
                      </Pressable>
                    </View>
                  </View>
                  <Text style={styles.factText}>{currentFact.fact_info}</Text>
                  <Text style={styles.tapAgainText}>Tap for another fact</Text>
                </Animated.View>
              ) : (
                <View style={styles.factPrompt}>
                  <Feather name="zap" size={24} color={Colors.dark.accent} />
                  <Text style={styles.factPromptText}>
                    {facts.length > 0 ? 'Did you know? (Tap for Fact)' : 'No facts available yet'}
                  </Text>
                </View>
              )}
            </Pressable>
          ) : null}

          {loadingFacts ? (
            <View style={styles.loadingFacts}>
              <ActivityIndicator size="small" color={Colors.dark.accent} />
            </View>
          ) : null}
        </ScrollView>
      </View>

      <Modal
        visible={showReportModal}
        animationType="fade"
        transparent
        onRequestClose={() => setShowReportModal(false)}
      >
        <View style={styles.reportModalOverlay}>
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={() => setShowReportModal(false)}
          />
          <Animated.View
            entering={FadeIn.duration(200)}
            exiting={FadeOut.duration(150)}
            style={styles.reportModalContent}
          >
            <BlurView intensity={80} tint="dark" style={StyleSheet.absoluteFill} />
            <View style={styles.reportModalInner}>
              <Text style={styles.reportModalTitle}>Report an Issue</Text>
              
              <Text style={styles.reportLabel}>What's wrong?</Text>
              <View style={styles.reasonButtons}>
                {REPORT_REASONS.map((reason) => (
                  <Pressable
                    key={reason}
                    style={[
                      styles.reasonButton,
                      reportReason === reason && styles.reasonButtonActive,
                    ]}
                    onPress={() => setReportReason(reason)}
                  >
                    <Text
                      style={[
                        styles.reasonButtonText,
                        reportReason === reason && styles.reasonButtonTextActive,
                      ]}
                    >
                      {reason}
                    </Text>
                  </Pressable>
                ))}
              </View>

              <Text style={styles.reportLabel}>Additional details (optional)</Text>
              <TextInput
                style={styles.reportCommentInput}
                placeholder="Tell us more..."
                placeholderTextColor={Colors.dark.textSecondary}
                value={reportComment}
                onChangeText={setReportComment}
                multiline
                numberOfLines={3}
              />

              <View style={styles.reportButtons}>
                <Pressable
                  style={styles.reportCancelButton}
                  onPress={() => {
                    setShowReportModal(false);
                    setReportComment('');
                  }}
                >
                  <Text style={styles.reportCancelText}>Cancel</Text>
                </Pressable>
                <Pressable
                  style={[
                    styles.reportSubmitButton,
                    submittingReport && styles.reportSubmitButtonDisabled,
                  ]}
                  onPress={handleSubmitReport}
                  disabled={submittingReport}
                >
                  {submittingReport ? (
                    <ActivityIndicator size="small" color="#FFF" />
                  ) : (
                    <Text style={styles.reportSubmitText}>Submit</Text>
                  )}
                </Pressable>
              </View>
            </View>
          </Animated.View>
        </View>
      </Modal>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  heroSection: {
    height: SCREEN_HEIGHT * 0.25,
    backgroundColor: Colors.dark.backgroundSecondary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  heroPlaceholder: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: Colors.dark.backgroundTertiary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeButton: {
    position: 'absolute',
    right: Spacing.lg,
    width: 36,
    height: 36,
    borderRadius: 18,
    overflow: 'hidden',
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeButtonPressed: {
    opacity: 0.7,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: Spacing.xl,
  },
  titleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: Spacing.lg,
  },
  title: {
    flex: 1,
    fontSize: 28,
    fontWeight: '700',
    color: Colors.dark.text,
    marginRight: Spacing.md,
  },
  voteButtons: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  voteButton: {
    padding: Spacing.sm,
  },
  audioPlayerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.lg,
    borderRadius: BorderRadius.md,
    overflow: 'hidden',
    marginBottom: Spacing['2xl'],
    gap: Spacing.md,
    backgroundColor: 'rgba(30, 36, 46, 0.6)',
  },
  audioPlayerDisabled: {
    opacity: 0.45,
  },
  audioPlayButton: {
    width: 44,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
  audioPlayButtonPressed: {
    opacity: 0.6,
  },
  audioDetails: {
    flex: 1,
    gap: Spacing.xs,
  },
  audioProgressTouchable: {
    paddingVertical: Spacing.xs,
  },
  audioProgressTrack: {
    height: 4,
    backgroundColor: Colors.dark.backgroundTertiary,
    borderRadius: 2,
    overflow: 'hidden',
  },
  audioProgressFill: {
    height: '100%',
    borderRadius: 2,
  },
  audioTimeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  audioTimeText: {
    fontSize: 11,
    color: Colors.dark.textSecondary,
    fontVariant: ['tabular-nums'],
  },
  audioUnavailableText: {
    fontSize: 12,
    color: Colors.dark.inactive,
  },
  narrative: {
    fontSize: 17,
    lineHeight: 28,
    color: Colors.dark.text,
    fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif',
    marginBottom: Spacing['3xl'],
  },
  factCard: {
    borderRadius: BorderRadius.md,
    overflow: 'hidden',
    backgroundColor: 'rgba(30, 36, 46, 0.6)',
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  factCardPressed: {
    opacity: 0.8,
  },
  factPrompt: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.xl,
    gap: Spacing.md,
  },
  factPromptText: {
    fontSize: 16,
    color: Colors.dark.text,
    fontWeight: '500',
  },
  factContent: {
    padding: Spacing.xl,
  },
  factHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Spacing.md,
    gap: Spacing.sm,
  },
  factLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.dark.accent,
    flex: 1,
  },
  factVoteButtons: {
    flexDirection: 'row',
    gap: Spacing.xs,
  },
  factVoteBtn: {
    padding: Spacing.xs,
  },
  factText: {
    fontSize: 16,
    lineHeight: 24,
    color: Colors.dark.text,
    fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif',
  },
  tapAgainText: {
    fontSize: 12,
    color: Colors.dark.textSecondary,
    marginTop: Spacing.md,
    textAlign: 'center',
  },
  loadingFacts: {
    padding: Spacing.xl,
    alignItems: 'center',
  },
  reportModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing.xl,
  },
  reportModalContent: {
    width: '100%',
    maxWidth: 400,
    borderRadius: BorderRadius.lg,
    overflow: 'hidden',
  },
  reportModalInner: {
    padding: Spacing.xl,
  },
  reportModalTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: Colors.dark.text,
    marginBottom: Spacing.xl,
    textAlign: 'center',
  },
  reportLabel: {
    fontSize: 14,
    color: Colors.dark.textSecondary,
    marginBottom: Spacing.sm,
  },
  reasonButtons: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
    marginBottom: Spacing.xl,
  },
  reasonButton: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.dark.backgroundTertiary,
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  reasonButtonActive: {
    backgroundColor: Colors.dark.accent,
    borderColor: Colors.dark.accent,
  },
  reasonButtonText: {
    fontSize: 14,
    color: Colors.dark.textSecondary,
  },
  reasonButtonTextActive: {
    color: '#FFF',
    fontWeight: '500',
  },
  reportCommentInput: {
    backgroundColor: Colors.dark.backgroundTertiary,
    borderRadius: BorderRadius.sm,
    padding: Spacing.lg,
    fontSize: 15,
    color: Colors.dark.text,
    minHeight: 80,
    textAlignVertical: 'top',
    marginBottom: Spacing.xl,
  },
  reportButtons: {
    flexDirection: 'row',
    gap: Spacing.md,
  },
  reportCancelButton: {
    flex: 1,
    paddingVertical: Spacing.md,
    alignItems: 'center',
    borderRadius: BorderRadius.sm,
    backgroundColor: Colors.dark.backgroundTertiary,
  },
  reportCancelText: {
    fontSize: 15,
    color: Colors.dark.textSecondary,
  },
  reportSubmitButton: {
    flex: 1,
    paddingVertical: Spacing.md,
    alignItems: 'center',
    borderRadius: BorderRadius.sm,
    backgroundColor: '#F44336',
  },
  reportSubmitButtonDisabled: {
    opacity: 0.6,
  },
  reportSubmitText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#FFF',
  },
});
