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
  }
];
