import { NextRequest, NextResponse } from 'next/server';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const type = searchParams.get('type') || 'leads';

  if (type === 'calling') {
    const csvContent = `clientName,phone,campaign,callDate,callTime,priority,scriptNotes
"Aarav Sharma","+91 98765 11111","Dholera Industrial Plots Q3","2026-09-14","11:30 AM","HIGH","Interested in 500 sq yard commercial plot near expressway"
"Neha Verma","+91 98765 22222","Dholera Industrial Plots Q3","2026-09-14","02:00 PM","MEDIUM","Follow up on brochure sent via WhatsApp"
"Kavita Patel","+91 98765 33333","Weekend Property Expo Calling","2026-09-14","04:30 PM","NORMAL","Introduce SIR phase 1 residential schemes"
"Suresh Iyer","+91 98765 44444","Weekend Property Expo Calling","2026-09-15","10:00 AM","HIGH","High net-worth investor requesting pricing matrix"`;

    return new NextResponse(csvContent, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': 'attachment; filename="orvion_calling_sample_template.csv"',
      },
    });
  }

  // Default: leads template
  const csvContent = `clientName,phone,alternatePhone,email,company,location,source,notes,status,nextAction,nextActionAt
"Rajesh Gupta","+91 98111 22222","+91 98111 33333","rajesh@guptasteel.com","Gupta Steel Works","Ahmedabad","Property Expo 2026","Looking for warehouse land parcel","INTERESTED","Site Tour Booking","2026-09-15T14:00:00.000Z"
"Ananya Sen","+91 98222 33333","","ananya.sen@apexdesign.in","Apex Architect Studio","Gandhinagar","Google Ads","Requested boundary coordinates and Master Plan","NEW","Initial Consultation","2026-09-14T11:00:00.000Z"
"Manish Mehta","+91 98333 44444","","mmehta@mehtatrading.co","Mehta Logistics","Surat","Referral","Referred by Anand Shah for solar farm parcel","INTERESTED","Send Feasibility Deck","2026-09-16T16:30:00.000Z"
"Pooja Deshmukh","+91 98444 55555","","pooja.d@innovatetech.com","Innovate Labs","Vadodara","LinkedIn Campaign","Inquired about commercial office zoning laws","CALL_BACK","Review Policy Draft","2026-09-15T10:30:00.000Z"`;

  return new NextResponse(csvContent, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="orvion_leads_sample_template.csv"',
    },
  });
}
