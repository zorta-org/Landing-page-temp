class HostingProvider:
    name='not_configured'
    def deploy(self,workspace,commit=None):return {'status':'provider_not_configured','provider':self.name}
    def status(self,deployment_id):return {'status':'provider_not_configured','provider':self.name}
    def logs(self,deployment_id):return {'status':'provider_not_configured','logs':[],'provider':self.name}
    def redeploy(self,deployment_id):return {'status':'provider_not_configured','provider':self.name}
    def stop(self,deployment_id):return {'status':'provider_not_configured','provider':self.name}
class PaymentProvider:
    name='not_configured'
    def create_payment(self,order):return {'status':'provider_not_configured','provider':self.name}
    def refund(self,payment_id):return {'status':'provider_not_configured','provider':self.name}
hosting=HostingProvider(); payments=PaymentProvider()
