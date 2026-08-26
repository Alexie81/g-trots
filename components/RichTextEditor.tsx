import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { WebView } from 'react-native-webview';
import * as ImagePicker from 'expo-image-picker';
import { ArrowDown, ArrowUp, Bold, ImagePlus, Italic, List, ListOrdered, Maximize2, Underline } from 'lucide-react-native';
import { Colors } from '@/constants/colors';

type Props = {
  value: string;
  onChange: (html: string) => void;
  onUploadImage?: (base64: string) => Promise<string>;
  minHeight?: number;
};

const commands = [
  { command: 'bold', label: 'Aldin', Icon: Bold },
  { command: 'italic', label: 'Cursiv', Icon: Italic },
  { command: 'underline', label: 'Subliniat', Icon: Underline },
  { command: 'insertUnorderedList', label: 'Lista', Icon: List },
  { command: 'insertOrderedList', label: 'Lista numerotata', Icon: ListOrdered },
] as const;

const imageCommands = [
  { command: 'moveUp', label: 'Muta imaginea mai sus', Icon: ArrowUp },
  { command: 'moveDown', label: 'Muta imaginea mai jos', Icon: ArrowDown },
  { command: 'resize', label: 'Schimba dimensiunea imaginii', Icon: Maximize2 },
] as const;

function readFileAsDataUrl(file: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Imaginea nu a putut fi citita.'));
    reader.readAsDataURL(file);
  });
}

export default function RichTextEditor({ value, onChange, onUploadImage, minHeight = 300 }: Props) {
  const nativeRef = useRef<WebView>(null);
  const webRef = useRef<any>(null);
  const webRangeRef = useRef<any>(null);
  const selectedWebImageRef = useRef<any>(null);
  const [uploading, setUploading] = useState(false);
  const [imageSelected, setImageSelected] = useState(false);
  const [message, setMessage] = useState('Poți lipi text și imagini direct în editor');

  const cleanWebHtml = () => {
    const editor = webRef.current;
    if (!editor) return '';
    const clone = editor.cloneNode(true);
    clone.querySelectorAll('.rich-image-selected').forEach((node: any) => {
      node.classList.remove('rich-image-selected');
      node.style.borderColor = 'transparent';
      node.style.removeProperty('box-shadow');
    });
    clone.querySelectorAll('[contenteditable]').forEach((node: any) => node.removeAttribute('contenteditable'));
    return clone.innerHTML;
  };

  const emitWebChange = () => onChange(cleanWebHtml());

  const normalizeWebImages = () => {
    const editor = webRef.current;
    const documentRef = editor?.ownerDocument;
    if (!editor || !documentRef) return;
    editor.querySelectorAll('img').forEach((image: any) => {
      let figure = image.closest('figure[data-rich-image]');
      if (!figure) {
        figure = documentRef.createElement('figure');
        figure.setAttribute('data-rich-image', '');
        figure.style.cssText = 'width:100%;max-width:100%;margin:18px auto;';
        image.parentNode?.insertBefore(figure, image);
        figure.appendChild(image);
      }
      figure.contentEditable = 'false';
      image.draggable = false;
      image.loading = 'lazy';
      image.style.cssText += ';width:100%;max-width:100%;height:auto;display:block;object-fit:contain;border-radius:14px';
    });
  };

  const saveWebSelection = () => {
    if (Platform.OS !== 'web' || !webRef.current) return;
    const selection = (globalThis as any).window?.getSelection?.();
    if (!selection?.rangeCount) return;
    const range = selection.getRangeAt(0);
    if (webRef.current.contains(range.commonAncestorContainer)) webRangeRef.current = range.cloneRange();
  };

  const restoreWebSelection = () => {
    const selection = (globalThis as any).window?.getSelection?.();
    if (!selection || !webRangeRef.current) return;
    selection.removeAllRanges();
    selection.addRange(webRangeRef.current);
  };

  const selectWebImage = (figure: any | null) => {
    if (selectedWebImageRef.current) {
      selectedWebImageRef.current.classList?.remove('rich-image-selected');
      selectedWebImageRef.current.style.borderColor = 'transparent';
      selectedWebImageRef.current.style.boxShadow = 'none';
    }
    selectedWebImageRef.current = figure;
    if (figure) {
      figure.classList?.add('rich-image-selected');
      figure.style.border = '2px solid #ff8126';
      figure.style.boxShadow = '0 0 0 3px rgba(255,129,38,.14)';
      setMessage('Imagine selectată: o poți muta sau redimensiona.');
    } else {
      setMessage('Poți lipi text și imagini direct în editor');
    }
    setImageSelected(Boolean(figure));
  };

  const insertWebImage = (url: string) => {
    const editor = webRef.current;
    const documentRef = editor?.ownerDocument;
    if (!editor || !documentRef || !url) return;
    const figure = documentRef.createElement('figure');
    figure.setAttribute('data-rich-image', '');
    figure.style.cssText = 'width:100%;max-width:100%;margin:18px auto;';
    figure.innerHTML = '<img src="' + url.replace(/"/g, '&quot;') + '" alt="Imagine din descriere" loading="lazy" style="width:100%;max-width:100%;height:auto;display:block;object-fit:contain;border-radius:14px">';
    figure.contentEditable = 'false';
    restoreWebSelection();
    const range = webRangeRef.current;
    const anchor = range?.startContainer?.nodeType === 3 ? range.startContainer.parentElement : range?.startContainer;
    const block = anchor?.closest?.('p,div,h2,h3,h4,blockquote,li');
    if (block && block.parentElement === editor) block.insertAdjacentElement('afterend', figure);
    else if (range) range.insertNode(figure);
    else editor.appendChild(figure);
    const paragraph = documentRef.createElement('p');
    paragraph.innerHTML = '<br>';
    figure.insertAdjacentElement('afterend', paragraph);
    selectWebImage(figure);
    emitWebChange();
  };

  const uploadAndInsert = async (base64: string) => {
    if (!onUploadImage || !base64) return;
    setUploading(true);
    setMessage('Imaginea se încarcă…');
    try {
      const url = await onUploadImage(base64);
      if (Platform.OS === 'web') insertWebImage(url);
      else nativeRef.current?.postMessage(JSON.stringify({ type: 'insertImage', url }));
      setMessage('Imagine adăugată. Apasă pe ea pentru mutare sau redimensionare.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Imaginea nu a putut fi încărcată.');
    } finally {
      setUploading(false);
    }
  };

  const pickImages = async () => {
    if (!onUploadImage || uploading) return;
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      setMessage('Permite accesul la fotografii pentru a adăuga imagini.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsMultipleSelection: true,
      selectionLimit: 6,
      orderedSelection: true,
      quality: 0.82,
      base64: true,
    });
    if (result.canceled) return;
    for (const asset of result.assets) {
      let dataUrl = asset.base64 ? 'data:' + (asset.mimeType || 'image/jpeg') + ';base64,' + asset.base64 : '';
      if (!dataUrl && Platform.OS === 'web' && asset.uri) {
        const blob = await fetch(asset.uri).then(response => response.blob());
        dataUrl = await readFileAsDataUrl(blob);
      }
      if (dataUrl) await uploadAndInsert(dataUrl);
    }
  };

  useEffect(() => {
    if (Platform.OS === 'web') {
      if (webRef.current && cleanWebHtml() !== value) {
        webRef.current.innerHTML = value || '';
        normalizeWebImages();
      }
      return;
    }
    nativeRef.current?.postMessage(JSON.stringify({ type: 'value', value }));
  }, [value]);

  const documentHtml = useMemo(() => `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1"><style>
    *{box-sizing:border-box}html,body{margin:0;background:#161519;color:#f5f5f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:15px;line-height:1.55}#editor{min-height:${minHeight - 22}px;padding:16px;outline:none;caret-color:#ff8126;cursor:text;user-select:text;-webkit-user-select:text}#editor:focus{box-shadow:inset 0 0 0 1px rgba(255,129,38,.45)}p{margin:.35em 0 .8em}a{color:#ff8c38}ul,ol{padding-left:1.4em}figure[data-rich-image]{position:relative;width:100%;max-width:100%;margin:18px auto;border:2px solid transparent;border-radius:16px;padding:4px;background:#211f24}figure[data-rich-image].rich-image-selected{border-color:#ff8126;box-shadow:0 0 0 3px rgba(255,129,38,.14)}figure[data-rich-image] img{width:100%;max-width:100%;height:auto;display:block;object-fit:contain;border-radius:12px}figure[data-rich-image]::after{content:'Apasă pentru opțiuni';position:absolute;right:10px;bottom:10px;padding:5px 8px;border-radius:999px;background:rgba(16,15,18,.8);color:#ff9b4a;font-size:10px;font-weight:800}
  </style></head><body><div id="editor" contenteditable="true">${value || ''}</div><script>
    const editor=document.getElementById('editor');let savedRange=null;let selectedFigure=null;
    const cleanHtml=()=>{const clone=editor.cloneNode(true);clone.querySelectorAll('.rich-image-selected').forEach(node=>node.classList.remove('rich-image-selected'));clone.querySelectorAll('[contenteditable]').forEach(node=>node.removeAttribute('contenteditable'));return clone.innerHTML};
    const post=data=>window.ReactNativeWebView.postMessage(JSON.stringify(data));const send=()=>post({type:'change',html:cleanHtml()});
    const normalizeImages=()=>editor.querySelectorAll('img').forEach(image=>{let figure=image.closest('figure[data-rich-image]');if(!figure){figure=document.createElement('figure');figure.setAttribute('data-rich-image','');figure.style.cssText='width:100%;max-width:100%;margin:18px auto;';image.parentNode.insertBefore(figure,image);figure.appendChild(image)}figure.contentEditable='false';image.draggable=false;image.loading='lazy';image.style.cssText+=';width:100%;max-width:100%;height:auto;display:block;object-fit:contain;border-radius:12px'});
    const saveSelection=()=>{const selection=getSelection();if(selection&&selection.rangeCount){const range=selection.getRangeAt(0);if(editor.contains(range.commonAncestorContainer))savedRange=range.cloneRange()}};
    const restoreSelection=()=>{if(!savedRange)return;const selection=getSelection();selection.removeAllRanges();selection.addRange(savedRange)};
    const selectImage=figure=>{selectedFigure?.classList.remove('rich-image-selected');selectedFigure=figure;figure?.classList.add('rich-image-selected');post({type:'imageSelected',selected:Boolean(figure)})};
    const insertImage=url=>{if(!url)return;const figure=document.createElement('figure');figure.setAttribute('data-rich-image','');figure.style.cssText='width:100%;max-width:100%;margin:18px auto;';figure.contentEditable='false';figure.innerHTML='<img src="'+String(url).replace(/"/g,'&quot;')+'" alt="Imagine din descriere" loading="lazy" style="width:100%;max-width:100%;height:auto;display:block;object-fit:contain;border-radius:12px">';restoreSelection();const range=savedRange;const anchor=range?.startContainer?.nodeType===3?range.startContainer.parentElement:range?.startContainer;const block=anchor?.closest?.('p,div,h2,h3,h4,blockquote,li');if(block&&block.parentElement===editor)block.insertAdjacentElement('afterend',figure);else if(range)range.insertNode(figure);else editor.appendChild(figure);const paragraph=document.createElement('p');paragraph.innerHTML='<br>';figure.insertAdjacentElement('afterend',paragraph);selectImage(figure);send()};
    const imageAction=action=>{if(!selectedFigure)return;if(action==='moveUp'){const previous=selectedFigure.previousElementSibling;if(previous)editor.insertBefore(selectedFigure,previous)}else if(action==='moveDown'){const next=selectedFigure.nextElementSibling;if(next)editor.insertBefore(selectedFigure,next.nextSibling)}else if(action==='resize'){const sizes=[100,75,50,33];const current=parseInt(selectedFigure.style.width||'100',10);const next=sizes[(Math.max(0,sizes.indexOf(current))+1)%sizes.length];selectedFigure.style.width=next+'%';selectedFigure.style.maxWidth='100%';selectedFigure.style.marginLeft='auto';selectedFigure.style.marginRight='auto'}send()};
    editor.addEventListener('input',()=>{normalizeImages();send()});editor.addEventListener('blur',()=>{saveSelection();send()});editor.addEventListener('keyup',saveSelection);editor.addEventListener('mouseup',saveSelection);editor.addEventListener('dblclick',event=>{event.preventDefault();event.stopPropagation()});editor.addEventListener('click',event=>{const figure=event.target.closest?.('figure[data-rich-image]');selectImage(figure||null);if(!figure)saveSelection()});
    editor.addEventListener('paste',event=>{const files=[...(event.clipboardData?.items||[])].filter(item=>item.type.startsWith('image/')).map(item=>item.getAsFile()).filter(Boolean);if(!files.length){setTimeout(()=>{normalizeImages();send()},0);return}event.preventDefault();files.forEach(file=>{const reader=new FileReader();reader.onload=()=>post({type:'pasteImage',base64:String(reader.result||'')});reader.readAsDataURL(file)})});
    document.addEventListener('selectionchange',saveSelection);document.addEventListener('message',handleMessage);window.addEventListener('message',handleMessage);function handleMessage(event){try{const data=JSON.parse(event.data);if(data.type==='command'){restoreSelection();editor.focus();document.execCommand(data.command,false,null);send()}else if(data.type==='value'&&cleanHtml()!==data.value){editor.innerHTML=data.value||'';normalizeImages()}else if(data.type==='insertImage')insertImage(data.url);else if(data.type==='imageAction')imageAction(data.action)}catch(error){}}normalizeImages();
  </script></body></html>`, [minHeight]);

  const runCommand = (command: string) => {
    if (Platform.OS === 'web') {
      restoreWebSelection();
      webRef.current?.focus?.();
      (globalThis as any).document?.execCommand?.(command, false, null);
      saveWebSelection();
      emitWebChange();
      return;
    }
    nativeRef.current?.postMessage(JSON.stringify({ type: 'command', command }));
  };

  const runImageCommand = (command: string) => {
    if (Platform.OS === 'web') {
      const editor = webRef.current;
      const figure = selectedWebImageRef.current;
      if (!editor || !figure) return;
      if (command === 'moveUp') {
        const previous = figure.previousElementSibling;
        if (previous) editor.insertBefore(figure, previous);
      } else if (command === 'moveDown') {
        const next = figure.nextElementSibling;
        if (next) editor.insertBefore(figure, next.nextSibling);
      } else if (command === 'resize') {
        const sizes = [100, 75, 50, 33];
        const current = Number.parseInt(figure.style.width || '100', 10);
        const next = sizes[(Math.max(0, sizes.indexOf(current)) + 1) % sizes.length];
        figure.style.width = String(next) + '%';
        figure.style.maxWidth = '100%';
        figure.style.marginLeft = 'auto';
        figure.style.marginRight = 'auto';
      }
      emitWebChange();
      return;
    }
    nativeRef.current?.postMessage(JSON.stringify({ type: 'imageAction', action: command }));
  };

  const onWebPaste = (event: any) => {
    const files = [...(event.clipboardData?.items || [])]
      .filter((item: any) => String(item.type || '').startsWith('image/'))
      .map((item: any) => item.getAsFile())
      .filter(Boolean);
    if (!files.length) {
      setTimeout(() => { normalizeWebImages(); emitWebChange(); }, 0);
      return;
    }
    event.preventDefault();
    void (async () => {
      for (const file of files) await uploadAndInsert(await readFileAsDataUrl(file));
    })();
  };

  return (
    <View style={styles.shell}>
      <View style={styles.toolbar}>
        {commands.map(({ command, label, Icon }) => (
          <TouchableOpacity key={command} style={styles.tool} accessibilityLabel={label} onPressIn={saveWebSelection} onPress={() => runCommand(command)}>
            <Icon size={17} color={Colors.textPrimary} />
          </TouchableOpacity>
        ))}
        <View style={styles.separator} />
        <TouchableOpacity style={[styles.tool, styles.imageTool, uploading && styles.disabled]} accessibilityLabel="Adaugă imagine" disabled={uploading || !onUploadImage} onPress={() => void pickImages()}>
          <ImagePlus size={18} color={Colors.orange} />
        </TouchableOpacity>
        {imageCommands.map(({ command, label, Icon }) => (
          <TouchableOpacity key={command} style={[styles.tool, !imageSelected && styles.disabled]} accessibilityLabel={label} disabled={!imageSelected} onPress={() => runImageCommand(command)}>
            <Icon size={16} color={imageSelected ? Colors.textPrimary : Colors.textMuted} />
          </TouchableOpacity>
        ))}
      </View>
      <Text style={[styles.pasteHint, uploading && styles.uploading]}>{message}</Text>
      {Platform.OS === 'web' ? (
        React.createElement('div', {
          ref: webRef,
          contentEditable: true,
          suppressContentEditableWarning: true,
          onInput: () => { normalizeWebImages(); emitWebChange(); },
          onBlur: () => { saveWebSelection(); emitWebChange(); },
          onFocus: saveWebSelection,
          onMouseUp: saveWebSelection,
          onKeyUp: saveWebSelection,
          onDoubleClick: (event: any) => { event.preventDefault(); event.stopPropagation(); },
          onClick: (event: any) => {
            const figure = event.target.closest?.('figure[data-rich-image]');
            selectWebImage(figure || null);
            if (!figure) saveWebSelection();
          },
          onPaste: onWebPaste,
          style: {
            minHeight,
            padding: 16,
            outline: 'none',
            caretColor: '#ff8126',
            cursor: 'text',
            userSelect: 'text',
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
          hideKeyboardAccessoryView={false}
          onMessage={(event) => {
            try {
              const data = JSON.parse(event.nativeEvent.data);
              if (data.type === 'change') onChange(String(data.html || ''));
              else if (data.type === 'pasteImage') void uploadAndInsert(String(data.base64 || ''));
              else if (data.type === 'imageSelected') setImageSelected(Boolean(data.selected));
            } catch {
              onChange(event.nativeEvent.data);
            }
          }}
          onLoadEnd={() => nativeRef.current?.postMessage(JSON.stringify({ type: 'value', value }))}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  shell: { overflow: 'hidden', borderWidth: 1, borderColor: '#49454F', borderRadius: 15, backgroundColor: '#161519' },
  toolbar: { minHeight: 51, flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 5, paddingHorizontal: 8, paddingVertical: 7, borderBottomWidth: 1, borderBottomColor: '#343137', backgroundColor: '#252329' },
  tool: { width: 35, height: 35, alignItems: 'center', justifyContent: 'center', borderRadius: 10, backgroundColor: 'rgba(255,255,255,0.055)' },
  imageTool: { backgroundColor: 'rgba(255,129,38,0.11)', borderWidth: 1, borderColor: 'rgba(255,129,38,0.22)' },
  separator: { width: 1, height: 24, marginHorizontal: 2, backgroundColor: '#464149' },
  disabled: { opacity: 0.32 },
  pasteHint: { minHeight: 28, paddingHorizontal: 12, paddingVertical: 7, color: Colors.textMuted, backgroundColor: '#1D1B20', fontFamily: 'Inter-Regular', fontSize: 9 },
  uploading: { color: Colors.orange },
});
