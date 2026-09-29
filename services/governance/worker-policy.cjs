'use strict';
function workerPolicy(policy={}){
 const result={batchSize:1000,maxTransactionsPerHour:10,maxGasPriceWei:'100000000',dailyReservationWei:'1000000000000000',l1AllowanceWei:'10000000000000',paused:true,...policy};
 for(const k of ['batchSize','maxTransactionsPerHour'])if(!Number.isSafeInteger(result[k])||result[k]<1)throw Error('Invalid policy '+k);
 if(result.batchSize>1000)throw Error('Maximum batch size is 1000');
 for(const k of ['maxGasPriceWei','dailyReservationWei','l1AllowanceWei'])if(!/^[1-9][0-9]*$/.test(String(result[k])))throw Error('Invalid policy '+k);
 return result;
}
module.exports={workerPolicy};
