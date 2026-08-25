import React, { useEffect, useMemo, useRef } from 'react';
import { Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { WebView } from 'react-native-webview';
import { Bold, Italic, List, ListOrdered, Underline } from 'lucide-react-native';
import { Colors } from '@/constants/colors';

type Props = {
  value: string;
  onChange: (html: string) => void;
  minHeight?: number;
};

const commands = [
  { command: 'bold', label: 'Aldin', Icon: Bold },
  { command: 'italic', label: 'Cursiv', Icon: Italic },
  { command: 'underline', label: 'Subliniat', Icon: Underline },
  { command: 'insertUnorderedList', label: 'Lista', Icon: List },
  { command: 'insertOrderedList', label: 'Lista numerotata', Icon: ListOrdered },
] as const;

export default function RichTextEditor({ value, onChange, minHeight = 220 }: Props) {
  const nativeRef = useRef<WebView>(null);
  const webRef = useRef<any>(null);

  useEffect(() => {
    if (Platform.OS === 'web') {
      if (webRef.current && webRef.current.innerHTML !== value) webRef.current.innerHTML = value || '';
      return;
    }
    nativeRef.current?.postMessage(JSON.stringify({ type: 'value', value }));
  }, [value]);

  const documentHtml = useMemo(() => `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1"><style>
    *{box-sizing:border-box}html,body{margin:0;background:#161519;color:#f5f5f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:15px;line-height:1.55}#editor{min-height:${minHeight - 22}px;padding:14px;outline:none}p{margin:.35em 0 .8em}a{color:#ff8c38}ul,ol{padding-left:1.4em}
  </style></head><body><div id="editor" contenteditable="true">${value || ''}</div><script>
    const editor=document.getElementById('editor');
    const send=()=>window.ReactNativeWebView.postMessage(editor.innerHTML);
    editor.addEventListener('input',send);editor.addEventListener('blur',send);
    document.addEventListener('message',event=>{try{const data=JSON.parse(event.data);if(data.type==='command'){editor.focus();document.execCommand(data.command,false,null);send()}if(data.type==='value'&&editor.innerHTML!==data.value){editor.innerHTML=data.value||''}}catch(e){}});
    window.addEventListener('message',event=>document.dispatchEvent(new MessageEvent('message',{data:event.data})));
  </script></body></html>`, [minHeight]);

  const runCommand = (command: string) => {
    if (Platform.OS === 'web') {
      webRef.current?.focus?.();
      (globalThis as any).document?.execCommand?.(command, false, null);
      onChange(webRef.current?.innerHTML || '');
      return;
    }
    nativeRef.current?.postMessage(JSON.stringify({ type: 'command', command }));
  };

  return (
    <View style={styles.shell}>
      <View style={styles.toolbar}>
        {commands.map(({ command, label, Icon }) => (
          <TouchableOpacity
            key={command}
            style={styles.tool}
            accessibilityLabel={label}
            onPress={() => runCommand(command)}>
            <Icon size={17} color={Colors.textPrimary} />
          </TouchableOpacity>
        ))}
        <Text style={styles.pasteHint}>Lipește textul formatat direct în editor</Text>
      </View>
      {Platform.OS === 'web' ? (
        React.createElement('div', {
          ref: webRef,
          contentEditable: true,
          suppressContentEditableWarning: true,
          onInput: (event: any) => onChange(event.currentTarget.innerHTML),
          onBlur: (event: any) => onChange(event.currentTarget.innerHTML),
          style: {
            minHeight,
            padding: 14,
            outline: 'none',
            color: '#F5F5F5',
            background: '#161519',
            fontFamily: 'Inter, Arial, sans-serif',
            fontSize: 14,
            lineHeight: 1.55,
          },
        })
      ) : (
        <WebView
          ref={nativeRef}
          source={{ html: documentHtml }}
          style={{ height: minHeight, backgroundColor: '#161519' }}
          containerStyle={{ height: minHeight }}
          originWhitelist={['*']}
          keyboardDisplayRequiresUserAction={false}
          onMessage={(event) => onChange(event.nativeEvent.data)}
          onLoadEnd={() => nativeRef.current?.postMessage(JSON.stringify({ type: 'value', value }))}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  shell: { overflow: 'hidden', borderWidth: 1, borderColor: '#49454F', borderRadius: 15, backgroundColor: '#161519' },
  toolbar: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 8, borderBottomWidth: 1, borderBottomColor: '#343137', backgroundColor: '#252329' },
  tool: { width: 35, height: 35, alignItems: 'center', justifyContent: 'center', borderRadius: 10, backgroundColor: 'rgba(255,255,255,0.055)' },
  pasteHint: { flex: 1, color: Colors.textMuted, fontFamily: 'Inter-Regular', fontSize: 8, textAlign: 'right' },
});
