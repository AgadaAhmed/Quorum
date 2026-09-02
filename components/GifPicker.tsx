import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Modal,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { Colors, FontSize, Radius, Spacing } from '../lib/theme';
import { searchGifs, trendingGifs, TenorResult } from '../lib/tenor';

type Props = {
  visible: boolean;
  onSelect: (result: TenorResult) => void;
  onClose: () => void;
};

const NUM_COLUMNS = 3;
const PAGE_SIZE = 24;

export default function GifPicker({ visible, onSelect, onClose }: Props) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<TenorResult[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async (q: string) => {
    setLoading(true);
    const data = q.trim() ? await searchGifs(q.trim(), PAGE_SIZE) : await trendingGifs(PAGE_SIZE);
    setResults(data);
    setLoading(false);
  }, []);

  useEffect(() => {
    if (!visible) return;
    setQuery('');
    load('');
  }, [visible, load]);

  const handlePick = useCallback(
    (item: TenorResult) => {
      onSelect(item);
      onClose();
    },
    [onSelect, onClose]
  );

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <View style={styles.header}>
            <Text style={styles.title}>Pick a GIF</Text>
            <TouchableOpacity onPress={onClose} accessibilityLabel="Close GIF picker" hitSlop={8}>
              <Ionicons name="close" size={24} color={Colors.text} />
            </TouchableOpacity>
          </View>

          <TextInput
            testID="gif-search-input"
            value={query}
            onChangeText={setQuery}
            onSubmitEditing={() => load(query)}
            placeholder="Search GIFs"
            placeholderTextColor={Colors.textMuted}
            returnKeyType="search"
            style={styles.search}
          />

          {loading ? (
            <ActivityIndicator style={styles.loader} color={Colors.text} />
          ) : results.length === 0 ? (
            <Text style={styles.empty}>No GIFs found. Try another search.</Text>
          ) : (
            <FlatList
              data={results}
              keyExtractor={(item) => item.id}
              numColumns={NUM_COLUMNS}
              contentContainerStyle={styles.grid}
              renderItem={({ item }) => (
                <TouchableOpacity
                  testID={`gif-result-${item.id}`}
                  style={styles.cell}
                  onPress={() => handlePick(item)}
                  accessibilityLabel="Select GIF"
                >
                  <Image source={{ uri: item.stillUrl }} style={styles.thumb} contentFit="cover" />
                </TouchableOpacity>
              )}
            />
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: Colors.background,
    borderTopLeftRadius: Radius.lg,
    borderTopRightRadius: Radius.lg,
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.md,
    height: '75%',
  },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: Spacing.sm },
  title: { fontSize: FontSize.lg, color: Colors.text, fontWeight: '700' },
  search: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    color: Colors.text,
    marginBottom: Spacing.sm,
  },
  loader: { marginTop: Spacing.xl },
  empty: { color: Colors.textMuted, textAlign: 'center', marginTop: Spacing.xl },
  grid: { paddingBottom: Spacing.xl },
  cell: { flex: 1 / NUM_COLUMNS, aspectRatio: 1, margin: 2, borderRadius: Radius.sm, overflow: 'hidden', backgroundColor: Colors.surface },
  thumb: { width: '100%', height: '100%' },
});
