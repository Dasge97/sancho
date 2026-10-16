from django.contrib.auth.decorators import login_required
from django.http import JsonResponse

from .models import Invoice


@login_required
def invoice_list(request):
    invoices = Invoice.objects.filter(user=request.user).values('id', 'number', 'total')
    return JsonResponse(list(invoices), safe=False)


@login_required
def invoice_detail(request, pk):
    from django.shortcuts import get_object_or_404
    invoice = get_object_or_404(Invoice, pk=pk, user=request.user)
    return JsonResponse({'id': invoice.id, 'number': invoice.number, 'total': str(invoice.total)})
