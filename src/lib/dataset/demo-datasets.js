/**
 * Curated Realistic Business Datasets for One-Click Demos & Downloads
 */

export const DEMO_DATASETS = [
  {
    id: 'saas_subscriptions',
    name: 'SaaS Subscription Renewals & Soft Declines',
    badge: 'SaaS B2B',
    description: '30 active subscription billing renewal failures across Starter, Growth, and Enterprise tiers with varied gateway response codes.',
    recordsCount: 30,
    estimatedRisk: '₹28.4L',
    csv: `customerId,customerName,email,company,plan,mrr,lifetimeValue,paymentMethod,failureReason,retryCount,previousSuccesses,previousFailures,discountAffinity
cust_saas_001,Aarav Mehta,aarav@cloudscale.io,CloudScale Technologies,enterprise,125000,1500000,card,gateway_error,0,18,0,0.15
cust_saas_002,Pooja Hegde,pooja@dataminds.ai,DataMinds Analytics,growth,45000,360000,card,insufficient_funds,1,12,1,0.40
cust_saas_003,Rohan Verma,rohan@webworks.co,WebWorks Studio,starter,9500,76000,upi,payment_timed_out,0,8,0,0.70
cust_saas_004,Sunita Rao,sunita@finnovate.in,Finnovate Capital,enterprise,210000,2940000,card,bank_server_down,0,24,0,0.10
cust_saas_005,Karan Singhal,karan@growthpulse.com,GrowthPulse Media,growth,38000,304000,card,card_expired,0,9,2,0.50
cust_saas_006,Meera Iyer,meera@zenithhr.com,Zenith HR Systems,starter,12000,96000,netbanking,network_error,0,6,1,0.65
cust_saas_007,Vikram Malhotra,vikram@alphaship.io,AlphaShip Logistics,enterprise,180000,2160000,card,card_declined,2,15,3,0.20
cust_saas_008,Ananya Deshmukh,ananya@edulearn.org,EduLearn Tech,starter,8500,51000,card,authentication_failed,1,5,1,0.75
cust_saas_009,Naveen Patnaik,naveen@nexasolutions.com,Nexa Solutions,growth,52000,416000,card,insufficient_funds,0,11,0,0.35
cust_saas_010,Deepika Shah,deepika@infinitedev.com,InfiniteDev Labs,enterprise,95000,1140000,card,payment_timed_out,0,14,0,0.25
cust_saas_011,Siddharth Joshi,sid@retailhub.in,RetailHub Global,growth,29000,232000,card,gateway_error,1,7,1,0.60
cust_saas_012,Tanvi Saxena,tanvi@omnisec.io,OmniSec Cyber,enterprise,165000,1980000,card,international_transaction_not_allowed,0,16,1,0.10
cust_saas_013,Gaurav Kulkarni,gaurav@talentflow.co,TalentFlow Systems,starter,7000,42000,upi,bank_server_down,0,4,0,0.80
cust_saas_014,Preeti Pillai,preeti@corestack.dev,CoreStack Cloud,growth,48000,384000,card,card_declined,3,10,4,0.45
cust_saas_015,Rahul Dravid,rahul@apexmetrics.in,Apex Metrics,enterprise,250000,3500000,card,insufficient_funds,0,20,0,0.15
cust_saas_016,Sneha Nair,sneha@beaconcrm.io,Beacon CRM,starter,11000,88000,card,card_expired,0,7,1,0.55
cust_saas_017,Aditya Kapoor,aditya@pulsehealth.in,Pulse Health AI,growth,36000,288000,netbanking,network_error,0,9,0,0.30
cust_saas_018,Kavita Menon,kavita@smartpos.co,SmartPOS Retail,enterprise,140000,1680000,card,gateway_error,0,13,0,0.20
cust_saas_019,Manish Pandey,manish@clickflow.io,ClickFlow Automation,starter,6500,39000,upi,payment_timed_out,1,3,1,0.85
cust_saas_020,Divya Chawla,divya@hypercloud.tech,HyperCloud Hosting,growth,55000,440000,card,insufficient_funds,1,10,2,0.40
cust_saas_021,Rajesh Khanna,rajesh@agilevault.com,AgileVault Corp,enterprise,175000,2450000,card,bank_server_down,0,19,0,0.10
cust_saas_022,Simran Kaur,simran@socialboost.in,SocialBoost Agency,starter,9000,63000,card,card_declined,0,6,0,0.60
cust_saas_023,Arjun Rampal,arjun@quantfin.ai,QuantFin Capital,enterprise,280000,3920000,card,gateway_error,0,22,1,0.05
cust_saas_024,Bhavna Patel,bhavna@streamlineops.co,StreamlineOps,growth,42000,336000,card,authentication_failed,0,8,0,0.50
cust_saas_025,Varun Dhawan,varun@bytebridge.io,ByteBridge Info,starter,10500,73500,upi,payment_cancelled,1,5,2,0.70
cust_saas_026,Alia Bhatt,alia@crestmedia.in,Crest Media Works,growth,60000,480000,card,insufficient_funds,0,12,0,0.30
cust_saas_027,Ranbir Kapoor,ranbir@dynamixai.com,Dynamix AI Systems,enterprise,195000,2340000,card,card_declined,1,17,2,0.15
cust_saas_028,Pooja Bhatt,pooja@ecosphere.org,EcoSphere Solutions,starter,8000,48000,card,card_expired,0,4,1,0.65
cust_saas_029,Sanjay Dutt,sanjay@falconlegal.in,Falcon Legal Tech,growth,46000,368000,netbanking,network_error,0,11,0,0.35
cust_saas_030,Kareena Kapoor,kareena@glamlook.co,GlamLook Direct,starter,13500,94500,upi,bank_server_down,0,7,1,0.80`
  },
  {
    id: 'ecommerce_dropoffs',
    name: 'E-Commerce High-LTV Cart Dropoffs & Abandonment',
    badge: 'E-Commerce',
    description: '20 high-intent checkout dropoffs with basket values, customer discount sensitivity, and cart abandonment timeout telemetry.',
    recordsCount: 20,
    estimatedRisk: '₹14.2L',
    csv: `user_id,customer_name,email,order_value,customer_segment,lifetime_value,cart_status,failure_reason,discount_affinity,previous_successful_payments,previous_failed_payments
cart_usr_101,Neha Agarwal,neha.a@gmail.com,18500,growth,148000,abandoned,checkout_abandoned,0.78,14,1
cart_usr_102,Kunal Shah,kunal.s@credclub.com,75000,enterprise,890000,abandoned,checkout_abandoned,0.22,26,0
cart_usr_103,Ritu Sen,ritu.sen@outlook.com,4200,starter,32000,timeout,checkout_timeout,0.85,5,2
cart_usr_104,Amitabh Roy,amitabh.roy@yahoo.in,52000,enterprise,624000,abandoned,checkout_abandoned,0.15,19,0
cart_usr_105,Swati Mishra,swati.m@gmail.com,12500,growth,98000,abandoned,checkout_abandoned,0.65,9,1
cart_usr_106,Tushar Kapoor,tushar.k@hotmail.com,8900,starter,44500,timeout,checkout_timeout,0.70,6,0
cart_usr_107,Pallavi Sharma,pallavi.s@luxeliving.in,110000,enterprise,1320000,abandoned,checkout_abandoned,0.10,31,1
cart_usr_108,Jitendra Joshi,jitendra@craftsman.co,24000,growth,168000,abandoned,checkout_abandoned,0.55,11,2
cart_usr_109,Monika Bedi,monika.b@gmail.com,6500,starter,26000,timeout,checkout_timeout,0.90,3,1
cart_usr_110,Harshvardhan Jain,harsh.j@techgems.in,92000,enterprise,1104000,abandoned,checkout_abandoned,0.18,22,0
cart_usr_111,Ishita Sen,ishita.sen@gmail.com,15000,growth,105000,abandoned,checkout_abandoned,0.60,8,0
cart_usr_112,Farhan Akhtar,farhan.a@excelent.com,64000,enterprise,768000,abandoned,checkout_abandoned,0.25,18,1
cart_usr_113,Bhumika Chawla,bhumika@homedecor.in,5400,starter,37800,timeout,checkout_timeout,0.80,5,1
cart_usr_114,Siddhesh Prabhu,sid.p@fastlane.in,33000,growth,231000,abandoned,checkout_abandoned,0.45,13,0
cart_usr_115,Radhika Apte,radhika.a@indiefilm.co,88000,enterprise,1056000,abandoned,checkout_abandoned,0.12,24,0
cart_usr_116,Chetan Bhagat,chetan.b@authornet.in,7800,starter,39000,abandoned,checkout_abandoned,0.72,7,2
cart_usr_117,Zoya Akhtar,zoya.a@tigerbaby.in,145000,enterprise,1740000,abandoned,checkout_abandoned,0.08,28,0
cart_usr_118,Mohit Suri,mohit.s@soundtrack.in,21500,growth,150500,timeout,checkout_timeout,0.50,10,1
cart_usr_119,Kriti Sanon,kriti.s@tribevibe.co,9800,starter,58800,abandoned,checkout_abandoned,0.82,6,1
cart_usr_120,Ayushmann Khurrana,ayushmann@tunes.in,120000,enterprise,1440000,abandoned,checkout_abandoned,0.14,27,0`
  },
  {
    id: 'b2b_invoices',
    name: 'B2B Accounts Receivable & Overdue Invoices',
    badge: 'Enterprise Invoicing',
    description: '15 high-value corporate invoices requiring dispute triage, payment link dispatch, and analyst escalation.',
    recordsCount: 15,
    estimatedRisk: '₹62.5L',
    csv: `account_id,client_name,contact_email,company,tier,invoice_amount,days_overdue,invoice_status,failure_reason,cumulative_revenue,paid_count,decline_count
inv_acc_501,Rajiv Bajaj,rajiv@bajajauto.corp,Bajaj Mobility Group,enterprise,450000,14,overdue,invoice_overdue,6200000,34,0
inv_acc_502,Sunil Mittal,sunil@airtelworld.com,Bharti Global Networks,enterprise,820000,28,overdue,invoice_overdue,11400000,48,1
inv_acc_503,Naveen Jindal,naveen@jindalsteel.in,Jindal Industrial Tech,enterprise,360000,7,overdue,invoice_overdue,4800000,26,0
inv_acc_504,Anand Mahindra,anand@mahindralabs.com,Mahindra Digital Labs,enterprise,950000,42,overdue,invoice_overdue,14200000,52,2
inv_acc_505,Pankaj Patel,pankaj@zyduslife.com,Zydus BioPharma,enterprise,280000,12,overdue,invoice_overdue,3600000,20,0
inv_acc_506,Gautam Adani,gautam@adaniports.co,Adani Supply Logistics,enterprise,1200000,35,overdue,invoice_overdue,18500000,60,1
inv_acc_507,Harsh Mariwala,harsh@maricoinfra.com,Marico Consumer Infrastructure,enterprise,190000,9,overdue,invoice_overdue,2400000,16,0
inv_acc_508,Nandan Nilekani,nandan@ekstep.org,EkStep Educational Tech,growth,85000,15,overdue,invoice_overdue,950000,12,1
inv_acc_509,Kiran Mazumdar,kiran@bioconlabs.in,Biocon Clinical Research,enterprise,540000,21,overdue,invoice_overdue,7800000,38,0
inv_acc_510,Azim Premji,azim@wiprotech.com,Wipro Systems Architecture,enterprise,730000,18,overdue,invoice_overdue,9800000,44,0
inv_acc_511,Sanjeev Bikhchandani,sanjeev@infoedge.in,InfoEdge Platforms,enterprise,310000,5,overdue,invoice_overdue,4200000,22,0
inv_acc_512,Deepinder Goyal,deepinder@zomatocorp.in,Zomato Cloud Logistics,growth,95000,25,overdue,invoice_overdue,1150000,14,2
inv_acc_513,Bhavish Aggarwal,bhavish@olaelectric.corp,Ola Mobility Systems,enterprise,640000,31,overdue,invoice_overdue,8400000,36,1
inv_acc_514,Vijay Shekhar,vijay@one97fin.com,One97 Merchant Gateway,growth,72000,8,overdue,invoice_overdue,880000,10,0
inv_acc_515,Ritesh Agarwal,ritesh@oyorooms.global,OYO Hospitality Tech,enterprise,48000,45,overdue,invoice_overdue,560000,8,3`
  },
  {
    id: 'mixed_gateways',
    name: 'Multi-Gateway Fintech Declines & Dropouts',
    badge: 'Fintech Mix',
    description: '12 diverse payment failure codes across Razorpay, Stripe, and UPI rails with real gateway error codes.',
    recordsCount: 12,
    estimatedRisk: '₹34.6L',
    csv: `transaction_id,customer_id,customer_name,email,plan,amount,payment_method,failure_reason,retry_count,previous_successful_payments,previous_failed_payments,discount_affinity
txn_gw_901,usr_gw_01,Ramesh Babu,ramesh@chennaitech.in,enterprise,68000,card,gateway_error,0,21,0,0.15
txn_gw_902,usr_gw_02,Ayesha Khan,ayesha@delhicraft.co,growth,24000,upi,payment_timed_out,1,11,1,0.45
txn_gw_903,usr_gw_03,Karthik Subramanian,karthik@bengalurulabs.io,enterprise,135000,card,insufficient_funds,0,29,1,0.20
txn_gw_904,usr_gw_04,Shruti Hasan,shruti@hyderabadhealth.in,starter,7500,card,card_declined,2,5,2,0.75
txn_gw_905,usr_gw_05,Manoj Bajpayee,manoj@mumbaiarts.com,growth,39000,netbanking,bank_server_down,0,14,0,0.30
txn_gw_906,usr_gw_06,Tabu Hashmi,tabu@puneconsulting.co,enterprise,92000,card,authentication_failed,1,18,1,0.25
txn_gw_907,usr_gw_07,Nawazuddin Siddiqui,nawaz@kolkatamedia.in,starter,5800,upi,network_error,0,4,0,0.80
txn_gw_908,usr_gw_08,Vidya Balan,vidya@jaipurgems.com,growth,44000,card,card_expired,0,12,1,0.50
txn_gw_909,usr_gw_09,Kay Kay Menon,kaykay@ahmedabadtech.io,enterprise,185000,card,international_transaction_not_allowed,0,25,0,0.10
txn_gw_910,usr_gw_10,Pankaj Tripathi,pankaj@patnasolutions.in,growth,28000,card,insufficient_funds,1,9,1,0.40
txn_gw_911,usr_gw_11,Jaideep Ahlawat,jaideep@gurgaonops.co,enterprise,115000,card,gateway_error,0,22,0,0.18
txn_gw_912,usr_gw_12,Shefali Shah,shefali@noidacare.org,starter,9200,upi,payment_cancelled,1,6,2,0.65`
  },
  {
    id: 'revenue_recovery_sample',
    name: 'Revenue Recovery Sample Dataset',
    badge: 'Recommended',
    description: '77 revenue-risk events built to exercise every agent path: recoverable transient failures, network/gateway errors, hard declines, checkout/invoice/subscription/mandate variety, high-value and escalation-threshold accounts, and repeat customers for the memory demo.',
    recordsCount: 77,
    estimatedRisk: '₹5.2L',
    csv: `transaction_id,customer_id,customer_name,email,company,customer_segment,amount,mrr,lifetime_value,payment_method,failure_reason,retry_count,previous_successful_payments,previous_failed_payments,discount_affinity,opted_out
TXN5000,CUST_RCV_SISI0,Siddharth Singhal,siddharth.singhal@growthpulse.com,Nexa Solutions,growth,11154,10107,55416,card,gateway_error,0,19,1,0.20,0
TXN5001,CUST_RCV_PRSA1,Priya Saxena,priya.saxena@beacon.com,WebWorks Studio,growth,16780,8830,80728,upi,insufficient_funds,0,16,1,0.60,0
TXN5002,CUST_RCV_GAVE2,Gaurav Verma,gaurav.verma@finnovate.com,Zenith HR Systems,starter,1843,3972,3992,card,insufficient_funds,0,19,0,0.56,0
TXN5003,CUST_RCV_MEPA3,Meera Patnaik,meera.patnaik@webworks.com,Nexa Solutions,starter,369,4118,3704,card,insufficient_funds,0,18,1,0.16,0
TXN5004,CUST_RCV_NASH4,Naveen Shah,naveen.shah@growthpulse.com,GrowthPulse Media,starter,580,2124,2984,upi,insufficient_funds,0,19,1,0.78,0
TXN5005,CUST_RCV_MEHE5,Meera Hegde,meera.hegde@dataminds.com,DataMinds Analytics,starter,1762,2721,34728,card,insufficient_funds,0,15,0,0.34,0
TXN5006,CUST_RCV_RODE6,Rohan Deshmukh,rohan.deshmukh@beacon.com,Finnovate Capital,starter,2580,2553,29736,upi,insufficient_funds,0,24,1,0.14,0
TXN5007,CUST_RCV_MEPI7,Meera Pillai,meera.pillai@finnovate.com,GrowthPulse Media,growth,4106,5161,107856,upi,insufficient_funds,0,16,1,0.46,0
TXN5008,CUST_NET_SNKU8,Sneha Kulkarni,sneha.kulkarni@webworks.com,DataMinds Analytics,starter,3072,643,22428,card,network_error,1,6,0,0.76,0
TXN5009,CUST_NET_NADE9,Naveen Deshmukh,naveen.deshmukh@zenith.com,CloudScale Technologies,growth,11086,14587,18228,card,network_error,0,14,2,0.57,0
TXN5010,CUST_NET_PRHE10,Preeti Hegde,preeti.hegde@beacon.com,Zenith HR Systems,starter,1796,4228,25326,card,payment_timed_out,1,14,1,0.05,0
TXN5011,CUST_NET_ROPI11,Rohan Pillai,rohan.pillai@webworks.com,DataMinds Analytics,growth,13790,15108,21030,card,bank_server_down,1,15,0,0.23,0
TXN5012,CUST_NET_RAME12,Rahul Mehta,rahul.mehta@cloudscale.com,CloudScale Technologies,growth,9326,3510,20034,card,bank_server_down,1,8,2,0.85,0
TXN5013,CUST_HARD_ANDE13,Ananya Deshmukh,ananya.deshmukh@growthpulse.com,Finnovate Capital,growth,7961,6354,35476,card,invalid_card,2,18,2,0.98,0
TXN5014,CUST_HARD_MESA14,Meera Saxena,meera.saxena@growthpulse.com,GrowthPulse Media,starter,4262,1010,2814,card,account_closed,1,3,1,0.17,0
TXN5015,CUST_HARD_TAIY15,Tanvi Iyer,tanvi.iyer@finnovate.com,Nexa Solutions,starter,2853,3399,10633,card,card_expired,0,10,2,0.41,0
TXN5016,CUST_HARD_DESH16,Deepika Shah,deepika.shah@growthpulse.com,CloudScale Technologies,enterprise,17937,18238,178465,card,card_expired,1,16,0,0.65,0
TXN5017,CUST_HARD_PRKU17,Preeti Kulkarni,preeti.kulkarni@webworks.com,Zenith HR Systems,enterprise,25950,22022,90832,card,account_closed,2,14,0,1.00,0
TXN5018,CUST_HARD_MEME18,Meera Mehta,meera.mehta@webworks.com,Beacon CRM,growth,10704,7504,44359,card,account_closed,2,13,1,0.67,0
TXN5019,CUST_VAR_GAKU19,Gaurav Kulkarni,gaurav.kulkarni@growthpulse.com,DataMinds Analytics,growth,3343,17408,29088,netbanking,checkout_abandoned,0,5,0,0.70,0
TXN5020,CUST_VAR_SUHE20,Sunita Hegde,sunita.hegde@finnovate.com,WebWorks Studio,starter,475,2612,13626,card,invoice_overdue,0,5,0,0.37,0
TXN5021,CUST_VAR_ROPA21,Rohan Patnaik,rohan.patnaik@dataminds.com,Finnovate Capital,starter,399,3067,15816,upi,subscription_failed,0,8,2,0.33,0
TXN5022,CUST_VAR_PRME22,Priya Mehta,priya.mehta@finnovate.com,WebWorks Studio,starter,2967,4300,3066,netbanking,mandate_failure,0,8,2,0.26,0
TXN5023,CUST_VAR_GAHE23,Gaurav Hegde,gaurav.hegde@beacon.com,GrowthPulse Media,growth,11143,4466,73668,card,checkout_abandoned,0,17,0,0.82,0
TXN5024,CUST_VAR_RAMA24,Rahul Malhotra,rahul.malhotra@dataminds.com,Beacon CRM,starter,2037,3499,25176,upi,invoice_overdue,0,12,0,0.67,0
TXN5025,CUST_HVC_TAME25,Tanvi Mehta,tanvi.mehta@nexa.com,Beacon CRM,enterprise,17332,37848,302710,card,card_declined,0,20,0,0.03,0
TXN5026,CUST_HVC_ANSH26,Ananya Shah,ananya.shah@beacon.com,Nexa Solutions,enterprise,39335,30382,327645,card,insufficient_funds,0,21,1,0.02,0
TXN5027,CUST_HVC_PRKU27,Preeti Kulkarni,preeti.kulkarni@nexa.com,WebWorks Studio,enterprise,16885,35331,202824,card,insufficient_funds,0,23,1,0.11,0
TXN5028,CUST_HVC_VIPI28,Vikram Pillai,vikram.pillai@zenith.com,Nexa Solutions,enterprise,32934,22682,192907,card,card_declined,0,28,1,0.18,0
TXN5029,CUST_ESC_TADE29,Tanvi Deshmukh,tanvi.deshmukh@dataminds.com,WebWorks Studio,enterprise,66644,66644,799728,card,insufficient_funds,0,20,1,0.04,0
TXN5030,CUST_ESC_NAVE30,Naveen Verma,naveen.verma@beacon.com,Beacon CRM,enterprise,60590,60590,727080,card,gateway_error,0,27,1,0.06,0
TXN5031,CUST_ESC_MEHE31,Meera Hegde,meera.hegde@cloudscale.com,DataMinds Analytics,enterprise,93704,93704,1124448,card,insufficient_funds,0,27,1,0.08,0
TXN5032,CUST_MEM_MEDE32,Meera Deshmukh,meera.deshmukh@cloudscale.com,Finnovate Capital,growth,400,200,3000,card,authentication_failed,0,10,1,0.50,0
TXN5033,CUST_MEM_AASH33,Aarav Shah,aarav.shah@finnovate.com,Beacon CRM,growth,400,200,3000,card,authentication_failed,0,10,1,0.50,0
TXN5034,CUST_MEM_PRSA34,Preeti Saxena,preeti.saxena@zenith.com,Beacon CRM,growth,400,200,3000,card,authentication_failed,0,10,1,0.50,0
TXN5035,CUST_MEM_RADE35,Rahul Deshmukh,rahul.deshmukh@finnovate.com,DataMinds Analytics,growth,400,200,3000,card,authentication_failed,0,10,1,0.50,0
TXN5036,CUST_MEM_PRPA36,Priya Patnaik,priya.patnaik@cloudscale.com,Zenith HR Systems,growth,400,200,3000,card,authentication_failed,0,10,1,0.50,0
TXN5037,CUST_MEM_PRKU37,Priya Kulkarni,priya.kulkarni@nexa.com,CloudScale Technologies,growth,400,200,3000,card,authentication_failed,0,10,1,0.50,0
TXN5038,CUST_MEM_ROSA38,Rohan Saxena,rohan.saxena@dataminds.com,DataMinds Analytics,growth,400,200,3000,card,authentication_failed,0,10,1,0.50,0
TXN5039,CUST_MEM_PRSH39,Priya Shah,priya.shah@growthpulse.com,CloudScale Technologies,growth,400,200,3000,card,authentication_failed,0,10,1,0.50,0
TXN5040,CUST_MEM_AAPA40,Aarav Patnaik,aarav.patnaik@dataminds.com,Zenith HR Systems,growth,400,200,3000,card,authentication_failed,0,10,1,0.50,0
TXN5041,CUST_MEM_SIKU41,Siddharth Kulkarni,siddharth.kulkarni@cloudscale.com,WebWorks Studio,growth,400,200,3000,card,authentication_failed,0,10,1,0.50,0
TXN5042,CUST_MEM_NAMA42,Naveen Malhotra,naveen.malhotra@nexa.com,GrowthPulse Media,growth,400,200,3000,card,authentication_failed,0,10,1,0.50,0
TXN5043,CUST_MEM_VIPA43,Vikram Patnaik,vikram.patnaik@finnovate.com,WebWorks Studio,growth,400,200,3000,card,authentication_failed,0,10,1,0.50,0
TXN5044,CUST_MEM_ROMA44,Rohan Malhotra,rohan.malhotra@growthpulse.com,Beacon CRM,growth,400,200,3000,card,authentication_failed,0,10,1,0.50,0
TXN5045,CUST_MEM_SUSH45,Sunita Shah,sunita.shah@dataminds.com,Beacon CRM,growth,400,200,3000,card,authentication_failed,0,10,1,0.50,0
TXN5046,CUST_MEM_RADE46,Rahul Deshmukh,rahul.deshmukh@dataminds.com,Zenith HR Systems,growth,400,200,3000,card,authentication_failed,0,10,1,0.50,0
TXN5047,CUST_MEM_KASI47,Karan Singhal,karan.singhal@growthpulse.com,Nexa Solutions,growth,400,200,3000,card,authentication_failed,0,10,1,0.50,0
TXN5048,CUST_MEM_TAKU48,Tanvi Kulkarni,tanvi.kulkarni@zenith.com,Nexa Solutions,growth,400,200,3000,card,authentication_failed,0,10,1,0.50,0
TXN5049,CUST_MEM_PRHE49,Priya Hegde,priya.hegde@cloudscale.com,GrowthPulse Media,growth,400,200,3000,card,authentication_failed,0,10,1,0.50,0
TXN5050,CUST_MEM_SIPI50,Siddharth Pillai,siddharth.pillai@zenith.com,Zenith HR Systems,growth,400,200,3000,card,authentication_failed,0,10,1,0.50,0
TXN5051,CUST_MEM_TAKU51,Tanvi Kulkarni,tanvi.kulkarni@zenith.com,Beacon CRM,growth,400,200,3000,card,authentication_failed,0,10,1,0.50,0
TXN5052,CUST_REP_SNKU52,Sneha Kulkarni,sneha.kulkarni@finnovate.com,CloudScale Technologies,growth,4498,10111,40980,card,payment_cancelled,0,5,2,0.55,0
TXN5053,CUST_REP_SNKU52,Sneha Kulkarni,sneha.kulkarni@finnovate.com,CloudScale Technologies,growth,8470,15583,35868,card,authentication_failed,1,4,3,0.51,0
TXN5054,CUST_REP_SNKU52,Sneha Kulkarni,sneha.kulkarni@finnovate.com,CloudScale Technologies,growth,4196,3041,90738,card,authentication_failed,2,5,5,0.39,0
TXN5055,CUST_REP_AASI55,Aarav Singhal,aarav.singhal@zenith.com,Beacon CRM,growth,16008,11750,21048,card,authentication_failed,0,9,4,0.32,0
TXN5056,CUST_REP_AASI55,Aarav Singhal,aarav.singhal@zenith.com,Beacon CRM,growth,3396,4992,72006,card,authentication_failed,1,4,3,0.40,0
TXN5057,CUST_REP_AASI55,Aarav Singhal,aarav.singhal@zenith.com,Beacon CRM,growth,13004,11240,52380,card,payment_cancelled,2,8,5,0.59,0
TXN5058,CUST_MEM_MEDE32,Meera Deshmukh,meera.deshmukh@cloudscale.com,Finnovate Capital,growth,400,200,3000,card,authentication_failed,0,10,1,0.50,0
TXN5059,CUST_MEM_AASH33,Aarav Shah,aarav.shah@finnovate.com,Beacon CRM,growth,400,200,3000,card,authentication_failed,0,10,1,0.50,0
TXN5060,CUST_MEM_PRSA34,Preeti Saxena,preeti.saxena@zenith.com,Beacon CRM,growth,400,200,3000,card,authentication_failed,0,10,1,0.50,0
TXN5061,CUST_MEM_RADE35,Rahul Deshmukh,rahul.deshmukh@finnovate.com,DataMinds Analytics,growth,400,200,3000,card,authentication_failed,0,10,1,0.50,0
TXN5062,CUST_MEM_PRPA36,Priya Patnaik,priya.patnaik@cloudscale.com,Zenith HR Systems,growth,400,200,3000,card,authentication_failed,0,10,1,0.50,0
TXN5063,CUST_MEM_PRKU37,Priya Kulkarni,priya.kulkarni@nexa.com,CloudScale Technologies,growth,400,200,3000,card,authentication_failed,0,10,1,0.50,0
TXN5064,CUST_MEM_ROSA38,Rohan Saxena,rohan.saxena@dataminds.com,DataMinds Analytics,growth,400,200,3000,card,authentication_failed,0,10,1,0.50,0
TXN5065,CUST_MEM_PRSH39,Priya Shah,priya.shah@growthpulse.com,CloudScale Technologies,growth,400,200,3000,card,authentication_failed,0,10,1,0.50,0
TXN5066,CUST_MEM_AAPA40,Aarav Patnaik,aarav.patnaik@dataminds.com,Zenith HR Systems,growth,400,200,3000,card,authentication_failed,0,10,1,0.50,0
TXN5067,CUST_MEM_SIKU41,Siddharth Kulkarni,siddharth.kulkarni@cloudscale.com,WebWorks Studio,growth,400,200,3000,card,authentication_failed,0,10,1,0.50,0
TXN5068,CUST_MEM_NAMA42,Naveen Malhotra,naveen.malhotra@nexa.com,GrowthPulse Media,growth,400,200,3000,card,authentication_failed,0,10,1,0.50,0
TXN5069,CUST_MEM_VIPA43,Vikram Patnaik,vikram.patnaik@finnovate.com,WebWorks Studio,growth,400,200,3000,card,authentication_failed,0,10,1,0.50,0
TXN5070,CUST_MEM_ROMA44,Rohan Malhotra,rohan.malhotra@growthpulse.com,Beacon CRM,growth,400,200,3000,card,authentication_failed,0,10,1,0.50,0
TXN5071,CUST_MEM_SUSH45,Sunita Shah,sunita.shah@dataminds.com,Beacon CRM,growth,400,200,3000,card,authentication_failed,0,10,1,0.50,0
TXN5072,CUST_MEM_RADE46,Rahul Deshmukh,rahul.deshmukh@dataminds.com,Zenith HR Systems,growth,400,200,3000,card,authentication_failed,0,10,1,0.50,0
TXN5073,CUST_MEM_KASI47,Karan Singhal,karan.singhal@growthpulse.com,Nexa Solutions,growth,400,200,3000,card,authentication_failed,0,10,1,0.50,0
TXN5074,CUST_MEM_TAKU48,Tanvi Kulkarni,tanvi.kulkarni@zenith.com,Nexa Solutions,growth,400,200,3000,card,authentication_failed,0,10,1,0.50,0
TXN5075,CUST_MEM_PRHE49,Priya Hegde,priya.hegde@cloudscale.com,GrowthPulse Media,growth,400,200,3000,card,authentication_failed,0,10,1,0.50,0
TXN5076,CUST_MEM_SIPI50,Siddharth Pillai,siddharth.pillai@zenith.com,Zenith HR Systems,growth,400,200,3000,card,authentication_failed,0,10,1,0.50,0
TXN5077,CUST_MEM_TAKU51,Tanvi Kulkarni,tanvi.kulkarni@zenith.com,Beacon CRM,growth,400,200,3000,card,authentication_failed,0,10,1,0.50,0`
  }
];
