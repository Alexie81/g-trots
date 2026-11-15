<?php
declare(strict_types=1);

require_once __DIR__.'/nir-domain.php';

/** Source-document discount and the cost inherited by each consumption voucher. */
final class GtrotsConsumablesCost
{
    public static function allocate(int $amount, array $weights): array
    {
        $total=array_sum($weights);$result=[];$remainders=[];$left=$amount;
        foreach($weights as $i=>$weight){$product=$amount*$weight;$result[$i]=$total?intdiv($product,$total):0;$remainders[$i]=$total?$product%$total:0;$left-=$result[$i];}
        arsort($remainders,SORT_NUMERIC);
        foreach($remainders as $i=>$_){if($left<=0)break;$result[$i]++;$left--;}
        return $result;
    }

    public static function apply(array $lines,array $document): array
    {
        $type=$document['purchase_discount_type']??'fixed';
        if(!in_array($type,['fixed','percent'],true))throw new InvalidArgumentException('Alege reducere ca sumă fixă sau procent.');
        $raw=str_replace(',','.',trim((string)($document['purchase_discount_value']??0)));
        if(!is_numeric($raw)||!is_finite((float)$raw)||(float)$raw<0)throw new InvalidArgumentException('Reducerea trebuie să fie pozitivă sau zero.');
        if($type==='percent'&&(float)$raw>100)throw new InvalidArgumentException('Reducerea procentuală nu poate depăși 100%.');
        // The source amounts and VAT remain exactly as entered. The reduction is
        // deducted from their total, then allocated once in whole cents.
        $weights=array_map(fn($line)=>shopNirDecimalToScaled($line['total'],2),$lines);
        $base=array_sum($weights);$discount=$type==='percent'?shopNirDivideRounded($base*shopNirDecimalToScaled($raw,4),1000000):shopNirDecimalToScaled($raw,2);
        if($discount>$base)throw new InvalidArgumentException('Reducerea depășește valoarea totală a documentului.');
        $parts=self::allocate($discount,$weights);
        foreach($lines as $i=>&$line){
            $cost=$weights[$i]-$parts[$i];
            $line['purchaseDiscount']=$parts[$i]/100;$line['total']=$cost/100;$line['stockCost']=$cost/100;
            $line['stockUnit']=shopNirDivideRounded($cost*1000000,shopNirDecimalToScaled($line['quantity'],4))/10000;
        }unset($line);
        return $lines;
    }

    /** Consume the available carrying value; the last issue receives the rounding remainder. */
    public static function issue(int $cost,int $quantity,int $usedQuantity,int $usedCost,int $issued): int
    {
        $remaining=$quantity-$usedQuantity;$value=$cost-$usedCost;
        if($remaining<=0||$issued>$remaining||$value<0)throw new InvalidArgumentException('Costul sau cantitatea disponibilă necesită corectarea documentului de intrare.');
        return $issued===$remaining?$value:shopNirDivideRounded($value*$issued,$remaining);
    }
}
