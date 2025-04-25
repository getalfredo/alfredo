<?php

namespace App\Console\Commands;

use Illuminate\Console\Command;
use Illuminate\Support\Facades\File;
use Illuminate\Support\Facades\Process as LaravelProcess;
use Symfony\Component\Process\Process;

class TestAnsibleCommand extends Command
{
    /**
     * The name and signature of the console command.
     *
     * @var string
     */
    protected $signature = 'app:test-ansible-command';

    /**
     * The console command description.
     *
     * @var string
     */
    protected $description = 'Test running an Ansible command';

    /**
     * Execute the console command.
     */
    public function handle()
    {
        $this->info('Running Ansible command...');

//        // It works
//        $result = LaravelProcess::run(
//            " ansible all -i 162.55.216.124, --user=root --private-key=local-vm/id_alfredo_dev -m ping"
//        );

//        $privateKey = $this->retrieveKeyFromDatabase();
        $privateKey = File::get(base_path('local-vm/id_alfredo_dev'));

        // Start ssh-agent
        $agentProcess = Process::fromShellCommandline('ssh-agent');
        $agentProcess->run();

        // Parse environment variables
        preg_match('/SSH_AUTH_SOCK=([^;]+)/', $agentProcess->getOutput(), $sockMatches);
        preg_match('/SSH_AGENT_PID=([^;]+)/', $agentProcess->getOutput(), $pidMatches);

        $env = [
            'SSH_AUTH_SOCK' => $sockMatches[1],
            'SSH_AGENT_PID' => $pidMatches[1],
        ];

        // Add key to agent
        $sshAddProcess = new Process(['ssh-add', '-']);
        $sshAddProcess->setEnv($env);
        $sshAddProcess->setInput($privateKey);
        $sshAddProcess->run();

        $result = LaravelProcess::env($env)->run(
            command: "ansible all -i 162.55.216.124, --user=root -m ping",
        );

        $result2 = LaravelProcess::env($env)->run(
            command: "ssh root@162.55.216.124 pwd",
        );

        // Kill agent
        $killProcess = new Process(['kill', $env['SSH_AGENT_PID']]);
        $killProcess->run();

        dd(
            'fooo',
            $result->output(),
            $result2->output(),
        );

    }
}
