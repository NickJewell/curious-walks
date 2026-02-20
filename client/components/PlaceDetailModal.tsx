import React, { useState, useEffect, useCallback, useRef } from 'react';
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
import SafeMapView, { Marker, isMapAvailable, PROVIDER_GOOGLE } from '@/components/SafeMapView';
import { getApiUrl, apiRequest } from '@/lib/query-client';
import { useAuth } from '@/contexts/AuthContext';
import type { Curio } from '@/lib/supabase';

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

function stripUrls(text: string): string {
  return text.replace(/https?:\/\/[^\s)>\]]+/gi, '').replace(/\s{2,}/g, ' ').trim();
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
  
  const [signedAudioUrl, setSignedAudioUrl] = useState<string | null>(null);
  const [audioError, setAudioError] = useState(false);
  const [audioLoading, setAudioLoading] = useState(false);
  const hasAudio = !!signedAudioUrl && !audioError;

  const [factAudioUrl, setFactAudioUrl] = useState<string | null>(null);
  const [factAudioLoading, setFactAudioLoading] = useState(false);
  const [factAudioError, setFactAudioError] = useState(false);
  const hasFactAudio = !!factAudioUrl && !factAudioError;

  const [activeSource, setActiveSource] = useState<'detail' | 'fact'>('detail');
  const keepAudioRef = useRef(false);

  const handleMapTapClose = useCallback(() => {
    keepAudioRef.current = true;
    onClose();
  }, [onClose]);

  const [shouldAutoPlay, setShouldAutoPlay] = useState(false);
  const player = useAudioPlayer(signedAudioUrl, { updateInterval: 500 });
  const status = useAudioPlayerStatus(player);

  const [shouldAutoPlayFact, setShouldAutoPlayFact] = useState(false);
  const factPlayer = useAudioPlayer(factAudioUrl, { updateInterval: 500 });
  const factStatus = useAudioPlayerStatus(factPlayer);

  useEffect(() => {
    if (shouldAutoPlay && status.isLoaded && !status.playing) {
      player.play();
      setShouldAutoPlay(false);
    }
  }, [shouldAutoPlay, status.isLoaded, status.playing, player]);

  useEffect(() => {
    if (shouldAutoPlayFact && factStatus.isLoaded && !factStatus.playing) {
      factPlayer.play();
      setShouldAutoPlayFact(false);
    }
  }, [shouldAutoPlayFact, factStatus.isLoaded, factStatus.playing, factPlayer]);

  useEffect(() => {
    if (visible && place?.id) {
      setAudioError(false);
      setAudioLoading(true);
      setSignedAudioUrl(null);
      setFactAudioUrl(null);
      setFactAudioError(false);
      setActiveSource('detail');
      const url = new URL(`/api/places/${encodeURIComponent(place.id)}/audio-url`, getApiUrl());
      fetch(url.toString())
        .then(r => {
          if (!r.ok) throw new Error('Failed to fetch audio URL');
          return r.json();
        })
        .then(data => {
          setSignedAudioUrl(data.url);
          setShouldAutoPlay(true);
          setAudioLoading(false);
        })
        .catch(() => {
          setAudioError(true);
          setAudioLoading(false);
        });
    } else {
      setSignedAudioUrl(null);
      setAudioError(false);
      setAudioLoading(false);
      setShouldAutoPlay(false);
      setFactAudioUrl(null);
      setFactAudioError(false);
      setFactAudioLoading(false);
      setShouldAutoPlayFact(false);
    }
  }, [visible, place?.id]);

  const playFactAudio = useCallback((fact: Fact) => {
    if (!place) return;
    player.pause();
    setActiveSource('fact');
    setFactAudioError(false);
    setFactAudioLoading(true);
    setFactAudioUrl(null);
    const url = new URL(
      `/api/places/${encodeURIComponent(place.id)}/fact-audio/${encodeURIComponent(fact.id)}`,
      getApiUrl()
    );
    fetch(url.toString())
      .then(r => {
        if (!r.ok) throw new Error('Failed to fetch fact audio URL');
        return r.json();
      })
      .then(data => {
        setFactAudioUrl(data.url);
        setShouldAutoPlayFact(true);
        setFactAudioLoading(false);
      })
      .catch(() => {
        setFactAudioError(true);
        setFactAudioLoading(false);
      });
  }, [place, player]);

  const handlePlayPause = useCallback(() => {
    if (activeSource === 'fact' && hasFactAudio) {
      if (factStatus.playing) {
        factPlayer.pause();
      } else {
        factPlayer.play();
      }
      return;
    }
    if (!hasAudio || !signedAudioUrl) return;
    if (status.playing) {
      player.pause();
    } else {
      factPlayer.pause();
      setActiveSource('detail');
      player.play();
    }
  }, [activeSource, hasAudio, hasFactAudio, signedAudioUrl, status.playing, factStatus.playing, player, factPlayer]);

  const handleSeek = useCallback((locationX: number, layoutWidth: number) => {
    if (activeSource === 'fact' && hasFactAudio) {
      if (!factStatus.duration || factStatus.duration <= 0) return;
      const ratio = Math.max(0, Math.min(1, locationX / layoutWidth));
      factPlayer.seekTo(ratio * factStatus.duration);
      return;
    }
    if (!status.duration || status.duration <= 0) return;
    const ratio = Math.max(0, Math.min(1, locationX / layoutWidth));
    player.seekTo(ratio * status.duration);
  }, [activeSource, hasFactAudio, status.duration, factStatus.duration, player, factPlayer]);

  useEffect(() => {
    if (!visible) {
      if (keepAudioRef.current) {
        keepAudioRef.current = false;
      } else {
        player.pause();
        player.seekTo(0);
        factPlayer.pause();
        factPlayer.seekTo(0);
      }
    }
  }, [visible, player, factPlayer]);

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
    let selectedFact: Fact | null = null;

    if (unviewedFacts.length === 0) {
      if (facts.length > 0) {
        setViewedFactIds(new Set());
        selectedFact = facts[Math.floor(Math.random() * facts.length)];
        setViewedFactIds(new Set([selectedFact.id]));
      }
    } else {
      selectedFact = unviewedFacts[Math.floor(Math.random() * unviewedFacts.length)];
      setViewedFactIds(prev => new Set([...prev, selectedFact!.id]));
    }

    if (selectedFact) {
      setCurrentFact(selectedFact);
      setShowFact(true);
      playFactAudio(selectedFact);
    }
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
          {isMapAvailable && place.latitude && place.longitude ? (
            <>
              <SafeMapView
                style={StyleSheet.absoluteFill}
                provider={PROVIDER_GOOGLE}
                initialRegion={{
                  latitude: place.latitude,
                  longitude: place.longitude,
                  latitudeDelta: 0.003,
                  longitudeDelta: 0.003,
                }}
                scrollEnabled={false}
                zoomEnabled={false}
                rotateEnabled={false}
                pitchEnabled={false}
                showsUserLocation={false}
                showsMyLocationButton={false}
                userInterfaceStyle="dark"
                pointerEvents="none"
              >
                {Marker ? (
                  <Marker
                    coordinate={{
                      latitude: place.latitude,
                      longitude: place.longitude,
                    }}
                    tracksViewChanges={false}
                  />
                ) : null}
              </SafeMapView>
              <Pressable
                style={StyleSheet.absoluteFill}
                onPress={handleMapTapClose}
              />
            </>
          ) : (
            <Pressable style={styles.heroPlaceholder} onPress={handleMapTapClose}>
              <Feather name="map-pin" size={48} color={Colors.dark.accent} />
            </Pressable>
          )}
          
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

          {(() => {
            const isFactActive = activeSource === 'fact' && (hasFactAudio || factAudioLoading);
            const activeStatus = isFactActive ? factStatus : status;
            const isPlaying = isFactActive ? factStatus.playing : status.playing;
            const isLoading = isFactActive ? factAudioLoading : audioLoading;
            const isError = isFactActive ? factAudioError : audioError;
            const isReady = isFactActive ? hasFactAudio : hasAudio;
            const activeDuration = activeStatus.duration;
            const activeTime = activeStatus.currentTime;

            return (
              <View style={[styles.audioPlayerContainer, !isReady && !isLoading && styles.audioPlayerDisabled]}>
                <BlurView intensity={40} tint="dark" style={StyleSheet.absoluteFill} />
                <Pressable
                  onPress={handlePlayPause}
                  disabled={!isReady || isLoading || isError}
                  style={({ pressed }) => [
                    styles.audioPlayButton,
                    pressed && isReady && !isLoading && styles.audioPlayButtonPressed,
                  ]}
                >
                  {isLoading ? (
                    <ActivityIndicator size="small" color={Colors.dark.accent} />
                  ) : isError ? (
                    <Feather name="alert-circle" size={32} color={Colors.dark.inactive} />
                  ) : (
                    <Feather
                      name={isPlaying ? 'pause-circle' : 'play-circle'}
                      size={32}
                      color={isReady ? Colors.dark.accent : Colors.dark.inactive}
                    />
                  )}
                </Pressable>
                <View style={styles.audioDetails}>
                  {isFactActive ? (
                    <Text style={styles.audioSourceLabel}>Playing fact</Text>
                  ) : null}
                  <Pressable
                    style={styles.audioProgressTouchable}
                    disabled={!isReady}
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
                            width: isReady && activeDuration > 0
                              ? `${Math.min(100, (activeTime / activeDuration) * 100)}%`
                              : '0%',
                            backgroundColor: isReady ? Colors.dark.accent : Colors.dark.inactive,
                          },
                        ]}
                      />
                    </View>
                  </Pressable>
                  <View style={styles.audioTimeRow}>
                    {isError ? (
                      <Text style={styles.audioUnavailableText}>Audio not available</Text>
                    ) : isLoading ? (
                      <Text style={styles.audioUnavailableText}>Loading audio...</Text>
                    ) : isReady ? (
                      <>
                        <Text style={styles.audioTimeText}>
                          {formatTime(activeTime)}
                        </Text>
                        <Text style={styles.audioTimeText}>
                          {activeDuration > 0 ? formatTime(activeDuration) : '--:--'}
                        </Text>
                      </>
                    ) : (
                      <Text style={styles.audioUnavailableText}>Audio not available</Text>
                    )}
                  </View>
                </View>
              </View>
            );
          })()}

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
                  <Text style={styles.factText}>{stripUrls(currentFact.fact_info)}</Text>
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
  audioSourceLabel: {
    fontSize: 11,
    color: Colors.dark.accent,
    fontWeight: '600',
    marginBottom: 2,
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
