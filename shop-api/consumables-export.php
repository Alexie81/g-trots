<?php
declare(strict_types=1);

/** Premium PDF/XLSX exports for the consumables ledger and consumption vouchers. */
final class GtrotsConsumablesExport
{
    private const STOCK_HEADERS = ['Nr. crt.','Data doc.','Tip doc.','Serie/nr. doc.','Denumire consumabil','U.M.','Cantitate intrată','Cantitate consumată','Stoc actual','Preț unitar','Valoare fără TVA','TVA %','Valoare TVA','Discount','Valoare totală'];
    private const VOUCHER_HEADERS = ['Nr. crt.','Data bon','Serie/nr. bon','Predător','Primitor','Denumire consumabil','U.M.','Cantitate eliberată','Discount','Preț unitar după discount','Valoare','Document de intrare','Data doc. de intrare','Înregistrat de'];

    private static function e($value): string { return htmlspecialchars((string)$value, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8'); }
    private static function date($value): string { return $value ? implode('.', array_reverse(explode('-', substr((string)$value,0,10)))) : ''; }
    private static function type($value): string { return ['factura'=>'Factură','bon'=>'Bon','pv'=>'Proces-verbal'][(string)$value] ?? (string)$value; }
    private static function document(array $row): string { return trim((string)($row['series']??'').' '.(string)($row['document_number']??'')); }
    private static function voucher(array $row): string { return trim((string)($row['series']??'').' '.(string)($row['voucher_number']??'')); }
    private static function headers(array $headers,array $weights): string
    {
        $sum=array_sum($weights);
        return implode('',array_map(static fn($label,$width)=>'<th style="width:'.number_format(100*$width/$sum,3,'.','').'%">'.self::e($label).'</th>',$headers,$weights));
    }
    private static function period(array $data): string
    {
        if(empty($data['from'])&&empty($data['to']))return 'Toată perioada';
        return ($data['from']?self::date($data['from']):'Început').' – '.($data['to']?self::date($data['to']):'Prezent');
    }
    private static function identity(array $company): string
    {
        return implode(' | ',array_filter([!empty($company['cui'])?'CUI '.$company['cui']:'',!empty($company['registration_number'])?'Reg. Com. '.$company['registration_number']:'',$company['address']??'']));
    }
    private static function totals(array $stock): array
    {
        $result=['net'=>0.0,'vat'=>0.0,'total'=>0.0,'initial'=>0.0,'consumed'=>0.0,'remaining'=>0.0,'discount'=>0.0];
        foreach($stock as $row){foreach(['purchase_discount_amount'=>'discount','net_value'=>'net','vat_value'=>'vat','total_value'=>'total','quantity'=>'initial','consumed_quantity'=>'consumed','remaining_quantity'=>'remaining'] as $source=>$target)$result[$target]+=(float)($row[$source]??0);}
        return $result;
    }

    private static function relationships(array $targets): string
    {
        $xml='<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">';$i=1;
        foreach($targets as $type=>$target)$xml.='<Relationship Id="rId'.$i++.'" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/'.$type.'" Target="'.$target.'"/>';
        return $xml.'</Relationships>';
    }

    private static function styles(): string
    {
        $xml=shopNirReferenceXlsxStyles();
        $fonts='<font><b/><sz val="12"/><color rgb="FFFF7900"/><name val="Aptos"/></font>'
            .'<font><b/><sz val="18"/><color rgb="FF0A213D"/><name val="Aptos Display"/></font>'
            .'<font><sz val="10"/><color rgb="FF64748B"/><name val="Aptos"/></font>'
            .'<font><b/><sz val="10"/><color rgb="FFFFFFFF"/><name val="Aptos"/></font>'
            .'<font><sz val="11"/><color rgb="FF18324F"/><name val="Aptos"/></font>'
            .'<font><b/><sz val="16"/><color rgb="FF18324F"/><name val="Aptos Display"/></font>'
            .'<font><b/><sz val="10"/><color rgb="FF0B2748"/><name val="Aptos"/></font>'
            .'<font><b/><sz val="18"/><color rgb="FFFFFFFF"/><name val="Aptos Display"/></font>';
        $fills='<fill><patternFill patternType="solid"><fgColor rgb="FF0A213D"/></patternFill></fill>'
            .'<fill><patternFill patternType="solid"><fgColor rgb="FFF4F8FC"/></patternFill></fill>'
            .'<fill><patternFill patternType="solid"><fgColor rgb="FFFF7900"/></patternFill></fill>'
            .'<fill><patternFill patternType="solid"><fgColor rgb="FFFFF2E7"/></patternFill></fill>';
        $borders='<border><left/><right/><top/><bottom style="thin"><color rgb="FFE2E8F0"/></bottom><diagonal/></border>'
            .'<border><left style="thin"><color rgb="FFD9E4F0"/></left><right style="thin"><color rgb="FFD9E4F0"/></right><top style="thin"><color rgb="FFD9E4F0"/></top><bottom style="thin"><color rgb="FFD9E4F0"/></bottom><diagonal/></border>';
        $xf=static function(int $font,int $fill,int $border,string $align='',int $numFmt=0):string{$attrs=' numFmtId="'.$numFmt.'" fontId="'.$font.'" fillId="'.$fill.'" borderId="'.$border.'" xfId="0" applyFont="1" applyFill="1" applyBorder="1"'.($numFmt?' applyNumberFormat="1"':'');return '<xf'.$attrs.'><alignment vertical="center"'.$align.'/></xf>';};
        $styles=[
            $xf(9,0,0),$xf(10,0,0,' horizontal="right" indent="1" wrapText="1"'),$xf(11,0,0,' horizontal="right" indent="2" wrapText="1"'),
            $xf(14,10,0,' horizontal="left" indent="1" wrapText="1"'),$xf(15,10,0,' horizontal="left" indent="2" wrapText="1"'),$xf(15,10,3,' horizontal="center" wrapText="1"'),
            $xf(13,0,2,' horizontal="left" indent="1" wrapText="1"'),$xf(13,0,2,' horizontal="center"'),$xf(13,0,2,' horizontal="right" indent="1"',166),
            $xf(15,10,2,' horizontal="right" indent="1" wrapText="1"'),$xf(12,11,2,' horizontal="right" indent="1"',166),
            $xf(16,11,0,' horizontal="right" indent="1"',166),$xf(12,11,0,' horizontal="right" indent="2" wrapText="1"'),$xf(13,10,2,' horizontal="center"'),
            $xf(11,0,0,' horizontal="left" wrapText="1"'),$xf(15,10,2,' horizontal="right" indent="1"',166),
        ];
        $xml=str_replace('<fonts count="9">','<fonts count="17">',$xml);
        $xml=str_replace('</fonts><fills count="9">',$fonts.'</fonts><fills count="13">',$xml);
        $xml=str_replace('</fills><borders count="2">',$fills.'</fills><borders count="4">',$xml);
        $xml=str_replace('</borders><cellStyleXfs',$borders.'</borders><cellStyleXfs',$xml);
        $xml=str_replace('<cellXfs count="43">','<cellXfs count="59">',$xml);
        return str_replace('</cellXfs><cellStyles',implode('',$styles).'</cellXfs><cellStyles',$xml);
    }

    private static function sheetHeader(string $title,string $subtitle,string $period,int $lastColumn,array &$merges): array
    {
        $c=static fn($value,string $type='string',int $style=10):array=>shopNirPremiumXlsxCellSpec($value,$type,$style);
        $last=shopNirPremiumXlsxColumn($lastColumn);
        $rows=shopNirPremiumXlsxRow(1,[3=>$c('G-TROTS','string',43),7=>$c($title,'string',44)],40);$merges[]='C1:F1';$merges[]='G1:'.$last.'1';
        $rows.=shopNirPremiumXlsxRow(2,[3=>$c($subtitle,'string',57),7=>$c('Perioadă: '.$period,'string',45)],26);$merges[]='C2:F2';$merges[]='G2:'.$last.'2';
        $rows.=shopNirPremiumXlsxRow(3,[],16);$merges[]='A1:B3';
        return [$rows,$c];
    }

    public static function xlsx(array $data,array $company=[]): string
    {
        require_once __DIR__.'/nir-xlsx.php';$stock=$data['stock'];$vouchers=$data['vouchers'];$period=self::period($data);$totals=self::totals($stock);
        $stockMerges=[];[$stockRows,$cell]=self::sheetHeader('GESTIUNEA CONSUMABILELOR',$company['legal_name']??'G-Trots România',$period,15,$stockMerges);
        $stockRows.=shopNirPremiumXlsxRow(4,[1=>$cell('STOC ȘI VALORI','string',47),10=>$cell('VALOARE TOTALĂ CU TVA','string',55)],22);$stockMerges[]='A4:I4';$stockMerges[]='J4:O4';
        $stockRows.=shopNirPremiumXlsxRow(5,[1=>$cell(count($stock).(count($stock)===1?' poziție în gestiune':' poziții în gestiune'),'string',46),10=>$cell($totals['total'],'number',54)],34);$stockMerges[]='A5:I5';$stockMerges[]='J5:O5';
        $headers=[];foreach(self::STOCK_HEADERS as $i=>$label)$headers[$i+1]=$cell($label,'string',48);$stockRows.=shopNirPremiumXlsxRow(6,$headers,44);
        $r=7;foreach($stock as $index=>$row){$values=[$index+1,self::date($row['document_date']),self::type($row['document_type']),self::document($row),$row['product_name'],$row['unit'],$row['quantity'],$row['consumed_quantity'],$row['remaining_quantity'],$row['unit_price'],$row['net_value'],$row['vat_rate'],$row['vat_value'],$row['purchase_discount_amount']??0,$row['total_value']];$cells=[];foreach($values as $i=>$value){$numeric=in_array($i,[0,6,7,8,9,10,11,12,13,14],true);$money=in_array($i,[9,10,12,13,14],true);$style=$money?51:(($numeric||$i===1||$i===12)?50:49);if($i===7)$style=56;if($i===1)$style=50;$cells[$i+1]=$cell($value,$numeric?'number':'string',$style);}$stockRows.=shopNirPremiumXlsxRow($r++,$cells,max(28,ceil(mb_strlen((string)$row['product_name'])/27)*16));}
        $stockLast=$r-1;$stockRows.=shopNirPremiumXlsxRow($r,[1=>$cell('TOTAL GESTIUNE','string',52),7=>$cell($totals['initial'],'number',52),8=>$cell($totals['consumed'],'number',52),9=>$cell($totals['remaining'],'number',52),11=>$cell($totals['net'],'number',58),13=>$cell($totals['vat'],'number',58),14=>$cell($totals['discount'],'number',58),15=>$cell($totals['total'],'number',53)],36);$stockMerges[]='A'.$r.':F'.$r;$stockEnd=$r;

        $voucherMerges=[];[$voucherRows,$cell2]=self::sheetHeader('BONURI DE CONSUM',$company['legal_name']??'G-Trots România',$period,14,$voucherMerges);
        $voucherTotal=array_sum(array_map(fn($row)=>(float)$row['value'],$vouchers));$voucherRows.=shopNirPremiumXlsxRow(4,[1=>$cell2('BONURI ȘI ELIBERĂRI','string',47),9=>$cell2('VALOARE CONSUMATĂ','string',55)],22);$voucherMerges[]='A4:H4';$voucherMerges[]='I4:N4';
        $voucherRows.=shopNirPremiumXlsxRow(5,[1=>$cell2(count(array_unique(array_column($vouchers,'voucher_id'))).(count(array_unique(array_column($vouchers,'voucher_id')))===1?' bon':' bonuri').' · '.count($vouchers).(count($vouchers)===1?' poziție':' poziții'),'string',46),9=>$cell2($voucherTotal,'number',54)],34);$voucherMerges[]='A5:H5';$voucherMerges[]='I5:N5';
        $headers=[];foreach(self::VOUCHER_HEADERS as $i=>$label)$headers[$i+1]=$cell2($label,'string',48);$voucherRows.=shopNirPremiumXlsxRow(6,$headers,44);
        $r2=7;foreach($vouchers as $index=>$row){$values=[$index+1,self::date($row['voucher_date']),self::voucher($row),$row['giver_name'],$row['receiver_name'],$row['product_name'],$row['unit'],$row['quantity'],self::issueDiscount($row),self::issueUnitPrice($row),$row['value'],trim((string)$row['document_series'].' '.(string)$row['document_number']),self::date($row['document_date']??''),$row['created_by']];$cells=[];foreach($values as $i=>$value){$numeric=in_array($i,[0,7,8,9,10],true);$money=in_array($i,[8,9,10],true);$cells[$i+1]=$cell2($value,$numeric?'number':'string',$money?51:(($numeric||$i===1||$i===12)?50:49));}$voucherRows.=shopNirPremiumXlsxRow($r2++,$cells,max(28,ceil(mb_strlen((string)$row['product_name'])/27)*16));}
        $voucherLast=$r2-1;$voucherRows.=shopNirPremiumXlsxRow($r2,[1=>$cell2('TOTAL BONURI DE CONSUM','string',52),9=>$cell2(array_sum(array_column($vouchers,'discount_amount'))+array_sum(array_column($vouchers,'source_discount_amount')),'number',58),11=>$cell2($voucherTotal,'number',53)],36);$voucherMerges[]='A'.$r2.':H'.$r2;$voucherEnd=$r2;

        $files=[];$media=[];$mediaIndex=[];$logo=shopNirPremiumXlsxLogoImage(120,120);$drawingOverrides='';
        if($logo!==null){$name=shopNirPremiumXlsxRegisterMedia($media,$mediaIndex,$logo,'gtrots-logo');foreach([1,2] as $sheet){$pictures=[['media'=>$name,'name'=>'G-Trots','description'=>'Logo G-Trots','col'=>0,'row'=>0,'colOff'=>8*9525,'rowOff'=>8*9525,'cx'=>64*9525,'cy'=>64*9525]];$drawing=shopNirPremiumXlsxDrawing($pictures);$files['xl/drawings/drawing'.$sheet.'.xml']=$drawing['xml'];$files['xl/drawings/_rels/drawing'.$sheet.'.xml.rels']=$drawing['rels'];$files['xl/worksheets/_rels/sheet'.$sheet.'.xml.rels']=self::relationships(['drawing'=>'../drawings/drawing'.$sheet.'.xml']);$drawingOverrides.='<Override PartName="/xl/drawings/drawing'.$sheet.'.xml" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/>';}$files['xl/media/'.$name]=$logo['bytes'];}
        $files['[Content_Types].xml']='<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="png" ContentType="image/png"/><Default Extension="jpg" ContentType="image/jpeg"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/worksheets/sheet2.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>'.$drawingOverrides.'</Types>';
        $files['_rels/.rels']=self::relationships(['officeDocument'=>'xl/workbook.xml']);
        $files['xl/_rels/workbook.xml.rels']='<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet2.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>';
        $files['xl/workbook.xml']='<?xml version="1.0" encoding="UTF-8"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Consumabile" sheetId="1" r:id="rId1"/><sheet name="Bonuri de consum" sheetId="2" r:id="rId2"/></sheets><definedNames><definedName name="_xlnm.Print_Area" localSheetId="0">Consumabile!$A$1:$O$'.$stockEnd.'</definedName><definedName name="_xlnm.Print_Area" localSheetId="1">\'Bonuri de consum\'!$A$1:$N$'.$voucherEnd.'</definedName></definedNames><calcPr calcMode="auto" fullCalcOnLoad="1"/></workbook>';
        $files['xl/styles.xml']=self::styles();
        $files['xl/worksheets/sheet1.xml']=shopNirPremiumXlsxSheet($stockRows,[7,16,15,20,32,8,14,15,13,18,19,9,18,18,19],$stockEnd,15,['merges'=>$stockMerges,'drawing'=>$logo!==null,'freeze_rows'=>6,'freeze_columns'=>0,'auto_filter'=>$stockLast>=7?'A6:O'.$stockLast:'','fit_to_height'=>0,'header'=>'','footer'=>'&LG-Trots | Gestiunea consumabilelor&RPagina &P / &N']);
        $files['xl/worksheets/sheet2.xml']=shopNirPremiumXlsxSheet($voucherRows,[7,16,18,23,23,32,8,15,18,16,18,22,17,22],$voucherEnd,14,['merges'=>$voucherMerges,'drawing'=>$logo!==null,'freeze_rows'=>6,'freeze_columns'=>0,'auto_filter'=>$voucherLast>=7?'A6:N'.$voucherLast:'','fit_to_height'=>0,'header'=>'','footer'=>'&LG-Trots | Bonuri de consum&RPagina &P / &N']);
        // Without an attached printerSettings part, Excel ignores the A4/landscape
        // settings when usePrinterDefaults is explicitly false.
        foreach ([1,2] as $sheet) {
            $path='xl/worksheets/sheet'.$sheet.'.xml';
            $files[$path]=str_replace(' usePrinterDefaults="0"','',$files[$path]);
        }
        return shopNirBuildZip($files);
    }

    public static function html(array $data,array $company=[]): string
    {
        require_once __DIR__.'/nir-pdf.php';$stock=$data['stock'];$vouchers=$data['vouchers'];$totals=self::totals($stock);$logo=shopNirPdfLogoDataUri();$e=fn($v)=>self::e($v);
        $hero='<div class="hero"><table><tr><td class="brand">'.($logo?'<img src="'.$e($logo).'">':'').'<b>G-TROTS</b><small>'.$e($company['legal_name']??'G-Trots România').'</small></td><td class="title">GESTIUNEA CONSUMABILELOR<small>Documente justificative • Stoc • Bonuri de consum</small></td><td class="period"><small>PERIOADĂ</small><b>'.$e(self::period($data)).'</b></td></tr></table><p>'.$e(self::identity($company)).'</p></div>';
        $html='<!doctype html><html lang="ro"><head><meta charset="UTF-8"><style>'.self::css().'</style></head><body>'.$hero.'<table class="kpi"><tr><td><small>POZIȚII</small><b>'.count($stock).'</b></td><td><small>CANTITATE INTRATĂ</small><b>'.shopNirPdfDecimal($totals['initial'],4).'</b></td><td><small>CANTITATE CONSUMATĂ</small><b>'.shopNirPdfDecimal($totals['consumed'],4).'</b></td><td class="accent"><small>STOC ACTUAL</small><b>'.shopNirPdfDecimal($totals['remaining'],4).'</b></td><td class="accent"><small>VALOARE CU TVA</small><b>'.shopNirPdfMoney($totals['total']).'</b></td></tr></table><h2>Gestiunea consumabilelor</h2><table class="items">'.''.'<thead><tr>';
        $html.=self::headers(self::STOCK_HEADERS,[3,7,7,8,20,3,6,7,6,7,8,4,7,7,8]);$html.='</tr></thead><tbody>';
        foreach($stock as $index=>$row){$values=[$index+1,self::date($row['document_date']),self::type($row['document_type']),self::document($row),$row['product_name'],$row['unit'],$row['quantity'],$row['consumed_quantity'],$row['remaining_quantity'],$row['unit_price'],$row['net_value'],$row['vat_rate'],$row['vat_value'],$row['purchase_discount_amount']??0,$row['total_value']];$html.='<tr>';foreach($values as $i=>$value){if(in_array($i,[6,7,8],true))$value=shopNirPdfDecimal($value,4);elseif(in_array($i,[9,10,12,13,14],true))$value=shopNirPdfMoney($value);elseif($i===11)$value=shopNirPdfDecimal($value,2).'%';$html.='<td class="'.(in_array($i,[0,6,7,8,9,10,11,12,13,14],true)?'num':'').'">'.$e($value).'</td>';}$html.='</tr>';}$html.='</tbody></table>';
        $html.='<div class="page-break"></div>'.$hero.'<h2>Bonuri de consum</h2><p class="hint">Cantitățile sunt înscrise pozitiv pe bon, dar reprezintă ieșiri și reduc stocul consumabilelor.</p><table class="items vouchers">'.''.'<thead><tr>';$html.=self::headers(self::VOUCHER_HEADERS,[3,7,7,9,9,19,3,6,7,7,7,9,8,8]);$html.='</tr></thead><tbody>';
        foreach($vouchers as $index=>$row){$values=[$index+1,self::date($row['voucher_date']),self::voucher($row),$row['giver_name'],$row['receiver_name'],$row['product_name'],$row['unit'],$row['quantity'],self::issueDiscount($row),self::issueUnitPrice($row),$row['value'],trim((string)$row['document_series'].' '.(string)$row['document_number']),self::date($row['document_date']??''),$row['created_by']];$html.='<tr>';foreach($values as $i=>$value){if($i===7)$value=shopNirPdfDecimal($value,4);elseif(in_array($i,[8,9,10],true))$value=shopNirPdfMoney($value);$html.='<td class="'.(in_array($i,[0,7,8,9,10],true)?'num':'').'">'.$e($value).'</td>';}$html.='</tr>';}$html.='</tbody></table><p class="generated">Generat la '.date('d.m.Y H:i').' • G-Trots România</p></body></html>';return $html;
    }

    private static function css(): string
    {
        return '@page{size:A4 landscape;margin:7mm 7mm 12mm}body{font-family:DejaVu Sans,sans-serif;font-size:6.4pt;color:#132b47;margin:0}table{border-collapse:collapse;width:100%}.hero{border:1px solid #dce5ef;border-radius:5mm;padding:4mm 5mm 3mm;margin-bottom:3mm}.hero td{vertical-align:middle}.brand{width:27%}.brand img{width:13mm;float:left;margin-right:3mm}.brand b{display:block;font-size:17pt;color:#ff7900}.brand small{color:#64748b}.title{width:47%;text-align:center;font-size:15pt;font-weight:bold}.title small{display:block;margin-top:2mm;font-size:7pt;color:#64748b;font-weight:normal}.period{width:26%;background:#fff2e7;border:1px solid #ffd9b8;border-radius:4mm;text-align:center;padding:2.5mm}.period small{display:block;color:#8a5b32}.period b{display:block;margin-top:1mm;font-size:9pt}.hero p{border-top:1px solid #e2e8f0;margin:3mm 0 0;padding-top:2mm;color:#64748b}.kpi{border-collapse:separate;border-spacing:2mm 0;margin:0 -2mm 3mm;width:calc(100% + 4mm)}.kpi td{background:#f4f8fc;color:#132b47;border-radius:3mm;padding:2.5mm 3mm}.kpi small{display:block;color:#64748b}.kpi b{display:block;margin-top:1mm;font-size:10pt}.kpi .accent{background:#ff7900;color:#fff}.kpi .accent small{color:#fff}h2{margin:3mm 0 2mm;color:#0a213d;font-size:11pt}.items{table-layout:fixed;border:1px solid #dce5ef}.items thead{display:table-header-group}.items th{background:#eef3f8;color:#132b47;border:1px solid #dce5ef;padding:2.2mm .9mm;font-size:6pt;line-height:1.2}.items td{padding:2mm .9mm;border-right:1px solid #e5ebf2;border-bottom:1px solid #e5ebf2;overflow-wrap:break-word}.items tr{page-break-inside:avoid}.items tbody tr:nth-child(even) td{background:#f7f9fc}.num{text-align:right}.page-break{page-break-before:always}.hint{background:#fff2e7;border-left:1.2mm solid #ff7900;border-radius:2mm;padding:2mm 3mm;color:#714820}.generated{text-align:right;color:#7b8ba0;margin-top:3mm}.vouchers th{font-size:6pt}';
    }

    private static function issueUnitPrice(array $line): float
    {
        return (float)($line['discount_amount']??0)>0&&(float)$line['quantity']>0
            ? round((float)$line['value']/(float)$line['quantity'],4)
            : (float)$line['unit_price'];
    }
    private static function issueDiscount(array $line): float
    {
        return round((float)($line['source_discount_amount']??0)+(float)($line['discount_amount']??0),2);
    }

    private static function sourceDocument(array $line): string
    {
        return trim(self::type($line['document_type']??'').' '.trim(($line['document_series']??'').' '.($line['document_number']??''))).(!empty($line['document_date'])?' / '.self::date($line['document_date']):'');
    }

    private static function voucherStamp(array $company): ?array
    {
        require_once __DIR__.'/nir-xlsx.php';
        $stamp=shopNirPremiumXlsxSafeCompanyStamp($company['stamp_path']??null);
        if($stamp!==null)$stamp['mime']=['jpg'=>'image/jpeg','png'=>'image/png','webp'=>'image/webp'][$stamp['extension']];
        return $stamp;
    }

    public static function voucherHtml(array $voucher,array $company=[]): string
    {
        require_once __DIR__.'/nir-pdf.php';
        $e=fn($v)=>self::e($v);$logo=shopNirPdfLogoDataUri();$lines=$voucher['lines']??[];
        $number=self::voucher($voucher);$date=self::date($voucher['voucher_date']);
        $quantity=static fn($v)=>rtrim(rtrim(number_format((float)$v,4,',','.'),'0'),',');
        $html='<!doctype html><html lang="ro"><head><meta charset="UTF-8"><style>'.self::voucherCss().'</style></head><body>';
        $html.='<header><table><tr><td class="brand">'.($logo?'<img src="'.$e($logo).'">':'').'<b>G-TROTS</b><small>'.$e($company['legal_name']??'G-Trots România').'</small></td><td class="title">BON DE CONSUM<small>(COLECTIV)</small></td><td class="number"><span>SERIE / NUMĂR</span><b>'.$e($number).'</b></td></tr></table><div class="identity">'.$e(self::identity($company)).'</div></header>';
        $field=static fn($label,$value)=>'<td><small>'.$e($label).'</small><strong>'.$e($value?:'—').'</strong></td>';
        $html.='<table class="metadata"><tr>'.$field('Număr document',$number).$field('Data documentului',$date).$field('Produs / lucrare (comandă)',$voucher['work_reference']??'').$field('Nr. comandă / cod produs',$voucher['order_reference']??'').'</tr><tr><td colspan="2"><small>PREDĂTOR</small><strong>'.$e($voucher['giver_name']).'</strong></td><td colspan="2"><small>PRIMITOR</small><strong>'.$e($voucher['receiver_name']).'</strong></td></tr></table>';
        $headers=['Nr. crt.','Denumirea materialelor<br><span>(sort, marcă, profil, dimensiune)</span>','Cantitate<br>necesară','Cod','U.M.','Cantitate<br>eliberată','Discount<br><span>inclus · lei</span>','Preț unitar<br><span>după discount · lei</span>','Valoare<br><span>lei</span>'];
        $widths=[4,29,9,7,5,11,11,12,12];$html.='<table class="materials"><thead><tr>';
        foreach($headers as $i=>$label)$html.='<th style="width:'.$widths[$i].'%">'.$label.'</th>';
        $html.='</tr></thead><tbody>';$total=0;
        foreach($lines as $i=>$line){
            $total+=(float)$line['value'];
            $html.='<tr><td class="center">'.($i+1).'</td><td><b>'.$e($line['product_name']).'</b><small class="source">Intrare: '.$e(self::sourceDocument($line)).'</small></td><td class="center">'.(isset($line['required_quantity'])?$e($quantity($line['required_quantity'])):'').'</td><td class="center">'.$e($line['product_code']??'').'</td><td class="center">'.$e($line['unit']).'</td><td class="center"><b>'.$e($quantity($line['quantity'])).'</b></td><td class="num">'.$e(number_format(self::issueDiscount($line),2,',','.')).'</td><td class="num">'.$e(rtrim(rtrim(number_format(self::issueUnitPrice($line),4,',','.'),'0'),',')).'</td><td class="num"><b>'.$e(number_format((float)$line['value'],2,',','.')).'</b></td></tr>';
        }
        for($i=count($lines);$i<4;$i++)$html.='<tr class="blank">'.str_repeat('<td>&nbsp;</td>',9).'</tr>';
        $html.='</tbody></table>';
        $discount=(float)($voucher['discount_amount']??array_sum(array_column($lines,'discount_amount')));
        if($discount>0){
            $label='Discount'.(($voucher['discount_type']??'')==='percent'?' ('.shopNirPdfDecimal($voucher['discount_value'],4).'%)':'');
            $html.='<table class="discount-summary"><tr><td>Valoare înainte de discount</td><td>'.number_format($total+$discount,2,',','.').' lei</td></tr><tr><td>'.$e($label).'</td><td>− '.number_format($discount,2,',','.').' lei</td></tr></table>';
        }
        $html.='<table class="total"><tr><td>Valoarea materialelor eliberate'.($discount>0?' după discount':'').'</td><td>'.number_format($total,2,',','.').' lei</td></tr></table>';
        if(trim((string)($voucher['notes']??''))!=='')$html.='<div class="notes"><b>Observații</b> '.$e($voucher['notes']).'</div>';
        $stamp=self::voucherStamp($company);
        $stampHtml=$stamp?'<img src="data:'.$stamp['mime'].';base64,'.base64_encode($stamp['bytes']).'" alt="Ștampila firmei">':'<small>ȘTAMPILA FIRMEI</small>';
        $html.='<table class="signatures"><tr><td><small>DATA ȘI SEMNĂTURA</small><b>'.$e($date).'</b><div></div></td><td><small>GESTIONAR / PREDĂTOR</small><b>'.$e($voucher['giver_name']).'</b><div></div></td><td><small>PRIMITOR</small><b>'.$e($voucher['receiver_name']).'</b><div></div></td><td class="company-stamp">'.$stampHtml.'</td></tr></table>';
        return $html.'<p class="footnote">Cantitățile eliberate sunt înscrise pozitiv și reprezintă ieșiri din stocul de consumabile.</p></body></html>';
    }

    private static function voucherCss(): string
    {
        return '@page{size:A4 landscape;margin:9mm 10mm 13mm}body{margin:0;font-family:DejaVu Sans,sans-serif;font-size:8pt;color:#17304d}table{width:100%;border-collapse:collapse;table-layout:fixed}header{padding:2mm;border:1px solid #dbe3ed;border-radius:4mm;margin-bottom:3mm}header td{vertical-align:middle}.brand{width:38%}.brand img{width:12mm;float:left;margin-right:3mm}.brand b{display:block;color:#ff7900;font-size:16pt}.brand small{display:block;margin-top:1mm;font-size:7pt;color:#62738b}.title{width:39%;font-size:16pt;font-weight:bold;text-align:center}.title small{display:block;font-size:10pt;font-weight:normal;color:#718097;margin-top:1mm}.number{width:23%;text-align:right}.number span{display:block;color:#718097;font-size:7pt}.number b{display:block;color:#e56c00;font-size:21pt;margin-top:1mm}.identity{font-size:6.5pt;color:#718097;border-top:1px solid #e5ebf3;padding-top:1mm;margin-top:1mm}.metadata{margin:0 -1.5mm 2mm;width:calc(100% + 3mm);border-collapse:separate;border-spacing:1.5mm}.metadata td{border:1px solid #e5ebf2;border-radius:3mm;background:#f8fafc;padding:1.2mm 3mm;vertical-align:top;width:25%}.metadata small{display:block;color:#66768a;font-size:6.5pt;text-transform:uppercase;margin-bottom:.5mm}.metadata strong{font-size:9pt}.materials{border-collapse:separate;border-spacing:0}.materials thead{display:table-header-group}.materials th{background:#eef3f8;border:0;border-bottom:1px solid #dbe3ed;font-size:7pt;padding:1.4mm 1.4mm;line-height:1.3}.materials th span{font-size:6pt;font-weight:normal;color:#66768a}.materials td{border:0;border-bottom:1px solid #e4eaf1;padding:1.2mm 1.5mm;vertical-align:middle;font-size:8pt;word-wrap:break-word}.materials th:first-child{border-radius:3mm 0 0 0}.materials th:last-child{border-radius:0 3mm 0 0}.materials tr{page-break-inside:avoid}.materials .source{display:block;font-size:6.4pt;color:#748196;margin-top:.5mm}.materials tbody tr:nth-child(even){background:#fafbfd}.center{text-align:center}.num{text-align:right;white-space:nowrap}.blank td{height:3mm;padding:.7mm}.total{border-collapse:separate;border-spacing:0;margin-top:0;margin-bottom:3mm;page-break-inside:avoid}.discount-summary{margin-top:2mm;page-break-inside:avoid}.discount-summary td{padding:1.4mm 2mm;text-align:right;font-size:8pt}.discount-summary td:first-child{width:76%;color:#62738b}.total td:first-child{border-radius:0 0 0 3mm;width:76%;background:#f2f6fa;text-align:right;padding:2mm;font-weight:bold}.total td:last-child{border-radius:0 0 3mm 0;background:#ff7900;color:#fff;text-align:right;padding:2mm;font-size:12pt;font-weight:bold}.notes{padding:2mm 3mm;background:#fff6ec;border-radius:3mm;margin-bottom:3mm;font-size:7pt;line-height:1.5;word-wrap:break-word}.notes b{margin-right:2mm}.signatures{page-break-inside:avoid;border-collapse:separate;border-spacing:1.5mm;margin:0 -1.5mm;width:calc(100% + 3mm)}.signatures td{padding:2mm;border:1px solid #e3eaf1;border-radius:3mm;background:#fafbfd;vertical-align:top}.signatures small{display:block;font-size:6.5pt;color:#66768a;margin-bottom:2mm}.signatures b{display:block;font-size:8pt;font-weight:normal;min-height:4mm}.signatures div{margin-top:3mm;border-top:1px solid #c8d2df}.signatures .company-stamp{border:0;background:#fff;padding:1mm 3mm;text-align:right;vertical-align:middle}.company-stamp img{max-width:48mm;max-height:17mm}.footnote{color:#7b8899;font-size:6.5pt;margin-top:3mm}';
    }

    public static function voucherPdf(array $voucher,array $company=[]): string
    {
        $html=self::voucherHtml($voucher,$company);$options=new Dompdf\Options();
        $options->set('isRemoteEnabled',false);$options->set('isPhpEnabled',false);$options->set('isFontSubsettingEnabled',true);
        $pdf=new Dompdf\Dompdf($options);$pdf->setPaper('A4','landscape');$pdf->loadHtml($html,'UTF-8');$pdf->render();
        $font=$pdf->getFontMetrics()->getFont('DejaVu Sans','normal');
        $pdf->getCanvas()->page_text(29,572,'G-Trots | Bon de consum '.self::voucher($voucher),$font,6,[.38,.45,.55]);
        $pdf->getCanvas()->page_text(730,572,'Pagina {PAGE_NUM} / {PAGE_COUNT}',$font,6,[.38,.45,.55]);
        return $pdf->output();
    }

    public static function voucherXlsx(array $voucher,array $company=[]): string
    {
        require_once __DIR__.'/nir-xlsx.php';
        $c=static fn($value,$type='string',$style=49)=>shopNirPremiumXlsxCellSpec($value,$type,$style);
        $merges=['A1:A3','B1:D1','E1:I1','B2:D2','E2:I2','B3:I3'];
        $rows=shopNirPremiumXlsxRow(1,[2=>$c('G-TROTS','string',43),5=>$c('BON DE CONSUM (COLECTIV)','string',44)],40);
        $rows.=shopNirPremiumXlsxRow(2,[2=>$c($company['legal_name']??'G-Trots România','string',57),5=>$c(self::voucher($voucher),'string',45)],25);
        $rows.=shopNirPremiumXlsxRow(3,[2=>$c(self::identity($company),'string',57)],18);
        $meta=[['UNITATEA','SERIE / NUMĂR','DATA DOCUMENTULUI','PRODUS / LUCRARE'],[$company['legal_name']??'G-Trots România',self::voucher($voucher),self::date($voucher['voucher_date']),$voucher['work_reference']??''],['PREDĂTOR','PRIMITOR','NR. COMANDĂ / COD',''],[$voucher['giver_name'],$voucher['receiver_name'],$voucher['order_reference']??'','']];
        foreach($meta as $i=>$fields){$row=4+$i;$cells=[];foreach($fields as $j=>$value){$col=1+2*$j;$cells[$col]=$c($value,'string',$i%2?49:47);$merges[]=shopNirPremiumXlsxColumn($col).$row.':'.shopNirPremiumXlsxColumn($col+1).$row;}$rows.=shopNirPremiumXlsxRow($row,$cells,$i%2?max(32,...array_map(static fn($value)=>ceil(mb_strlen((string)$value)/25)*14+6,$fields)):26);}
        $rows.=shopNirPremiumXlsxRow(8,[],12);
        $labels=['Nr. crt.','Denumirea materialelor / document de intrare și data','Cantitate necesară','Cod','U.M.','Cantitate eliberată','Discount inclus','Preț unitar după discount','Valoare'];$headers=[];
        foreach($labels as $i=>$label)$headers[$i+1]=$c($label,'string',48);
        $rows.=shopNirPremiumXlsxRow(9,$headers,40);$r=10;$total=0;
        foreach($voucher['lines'] as $i=>$line){$total+=(float)$line['value'];$rows.=shopNirPremiumXlsxRow($r++,[1=>$c($i+1,'number',50),2=>$c($line['product_name']."\nIntrare: ".self::sourceDocument($line)),3=>$c($line['required_quantity']??'',isset($line['required_quantity'])?'number':'string',50),4=>$c($line['product_code']??'','string',50),5=>$c($line['unit'],'string',50),6=>$c($line['quantity'],'number',50),7=>$c(self::issueDiscount($line),'number',51),8=>$c(self::issueUnitPrice($line),'number',50),9=>$c($line['value'],'number',51)],max(44,(ceil(mb_strlen($line['product_name'])/44)+ceil(mb_strlen('Intrare: '.self::sourceDocument($line))/44))*14+10));}
        $last=$r-1;
        for($i=count($voucher['lines']);$i<6;$i++){$cells=[];for($col=1;$col<=9;$col++)$cells[$col]=$c('');$rows.=shopNirPremiumXlsxRow($r++,$cells,16);}
        $discount=(float)($voucher['discount_amount']??array_sum(array_column($voucher['lines'],'discount_amount')));
        if($discount>0){
            $label='DISCOUNT'.(($voucher['discount_type']??'')==='percent'?' ('.rtrim(rtrim(number_format((float)$voucher['discount_value'],4,',',''),'0'),',').'%)':'');
            foreach([['VALOARE ÎNAINTE DE DISCOUNT',$total+$discount],[$label,-$discount]] as [$text,$amount]){
                $rows.=shopNirPremiumXlsxRow($r,[1=>$c($text,'string',52),9=>$c($amount,'number',58)],25);$merges[]='A'.$r.':H'.$r;$r++;
            }
        }
        $rows.=shopNirPremiumXlsxRow($r,[1=>$c('TOTAL MATERIALE ELIBERATE','string',52),9=>$c($total,'number',53)],32);$merges[]='A'.$r.':H'.$r;$r+=2;
        if(trim((string)($voucher['notes']??''))!==''){$rows.=shopNirPremiumXlsxRow($r,[1=>$c('Observații: '.$voucher['notes'],'string',57)],max(32,ceil(mb_strlen($voucher['notes'])/100)*14));$merges[]='A'.$r.':I'.$r;$r+=2;}
        $stampRow=$r;
        foreach([['DATA ȘI SEMNĂTURA','GESTIONAR / PREDĂTOR','PRIMITOR'],[self::date($voucher['voucher_date']),$voucher['giver_name'],$voucher['receiver_name']],['________________','________________','________________']] as $i=>$fields){$cells=[];foreach($fields as $j=>$value){$col=1+$j*2;$cells[$col]=$c($value,'string',$i===0?47:49);$merges[]=shopNirPremiumXlsxColumn($col).$r.':'.shopNirPremiumXlsxColumn($col+1).$r;}$rows.=shopNirPremiumXlsxRow($r++,$cells,$i===2?28:($i===1?max(26,...array_map(static fn($value)=>ceil(mb_strlen((string)$value)/25)*14+4,$fields)):26));}
        $merges[]='G'.$stampRow.':I'.($r-1);
        $sheet=shopNirPremiumXlsxSheet($rows,[7,32,13,11,8,14,16,16,16],$r-1,9,['merges'=>$merges,'freeze_rows'=>9,'fit_to_height'=>count($voucher['lines'])<=6?1:0,'header'=>'','footer'=>'&LG-Trots | Bon de consum '.self::voucher($voucher).'&RPagina &P / &N']);
        $sheet=str_replace([' usePrinterDefaults="0"','<col min="2" max="2" width="32.00"'],['','<col min="2" max="2" width="48.00"'],$sheet);
        $files=[
            '_rels/.rels'=>self::relationships(['officeDocument'=>'xl/workbook.xml']),
            'xl/_rels/workbook.xml.rels'=>self::relationships(['worksheet'=>'worksheets/sheet1.xml','styles'=>'styles.xml']),
            'xl/workbook.xml'=>'<?xml version="1.0" encoding="UTF-8"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Bon de consum" sheetId="1" r:id="rId1"/></sheets><definedNames><definedName name="_xlnm.Print_Area" localSheetId="0">\'Bon de consum\'!$A$1:$I$'.($r-1).'</definedName><definedName name="_xlnm.Print_Titles" localSheetId="0">\'Bon de consum\'!$9:$9</definedName></definedNames></workbook>',
            'xl/styles.xml'=>self::styles(),
        ];
        $drawingOverride='';$logo=shopNirPremiumXlsxLogoImage(120,120);$stamp=self::voucherStamp($company);
        $pictures=[];$media=[];$index=[];
        if($logo!==null){$name=shopNirPremiumXlsxRegisterMedia($media,$index,$logo,'gtrots-logo');$pictures[]=['media'=>$name,'name'=>'G-Trots','description'=>'Logo G-Trots','col'=>0,'row'=>0,'colOff'=>4*9525,'rowOff'=>8*9525,'cx'=>40*9525,'cy'=>40*9525];}
        if($stamp!==null){$name=shopNirPremiumXlsxRegisterMedia($media,$index,$stamp,'stampila');$scale=min(190/max(1,$stamp['width']),80/max(1,$stamp['height']));$pictures[]=['media'=>$name,'name'=>'Ștampila firmei','description'=>'Identitatea firmei','col'=>6,'row'=>$stampRow-1,'colOff'=>8*9525,'rowOff'=>4*9525,'cx'=>(int)($stamp['width']*$scale*9525),'cy'=>(int)($stamp['height']*$scale*9525)];}
        if($pictures){$drawing=shopNirPremiumXlsxDrawing($pictures);$files['xl/drawings/drawing1.xml']=$drawing['xml'];$files['xl/drawings/_rels/drawing1.xml.rels']=$drawing['rels'];$files['xl/worksheets/_rels/sheet1.xml.rels']=self::relationships(['drawing'=>'../drawings/drawing1.xml']);foreach($media as $name=>$bytes)$files['xl/media/'.$name]=$bytes;$sheet=str_replace('</worksheet>','<drawing r:id="rId1"/></worksheet>',$sheet);$drawingOverride='<Override PartName="/xl/drawings/drawing1.xml" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/>';}
        $files['xl/worksheets/sheet1.xml']=$sheet;
        $files['[Content_Types].xml']='<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="png" ContentType="image/png"/><Default Extension="jpg" ContentType="image/jpeg"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>'.$drawingOverride.'</Types>';
        return shopNirBuildZip($files);
    }

    public static function pdf(array $data,array $company=[]): string
    {
        $html=self::html($data,$company);$options=new Dompdf\Options();$options->set('isRemoteEnabled',false);$options->set('isPhpEnabled',false);$options->set('isFontSubsettingEnabled',true);$pdf=new Dompdf\Dompdf($options);$pdf->setPaper('A4','landscape');$pdf->loadHtml($html,'UTF-8');$pdf->render();$font=$pdf->getFontMetrics()->getFont('DejaVu Sans','normal');$pdf->getCanvas()->page_text(22,571,'G-Trots | Gestiunea consumabilelor',$font,6,[.38,.45,.55]);$pdf->getCanvas()->page_text(733,571,'Pagina {PAGE_NUM} / {PAGE_COUNT}',$font,6,[.38,.45,.55]);return $pdf->output();
    }
}
